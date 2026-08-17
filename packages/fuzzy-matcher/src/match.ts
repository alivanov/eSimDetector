import type { MatcherDevice, QuerySlots } from './types';
import type {
  ConstraintOptions,
  ConstraintRejection,
  ConstraintRejectionCode,
} from './constraints';
import { rejectCandidate } from './constraints';
import type { ScoredCandidate, ScoringWeights } from './scoring';
import { DEFAULT_SCORING_WEIGHTS, buildComparableQueryText, scoreCandidate } from './scoring';
import { rankCandidates } from './ranking';
import type {
  Decision,
  DecisionOptions,
  DecisionReasonCode,
  DecisionStatus,
  DecisionThresholds,
} from './decision';
import { DEFAULT_DECISION_THRESHOLDS, decide } from './decision';
import type { AliasIndex } from './exact-index';
import { buildAliasIndex, lookupAlias, lookupModelCode } from './exact-index';
import type { FindTrigramCandidatesOptions, TrigramIndex } from './trigram/inverted-index';
import { buildTrigramIndex, findTrigramCandidates } from './trigram/inverted-index';

/**
 * Полный конвейер отбора кандидатов, оценки, ранжирования и решения (docs/04-matching-algorithm.md,
 * §4.6—4.7). Собирает воедино все шаги, реализованные в этом пакете: точный индекс (`exact-index.ts`),
 * триграммный отбор (`trigram/`), жёсткие ограничения (`constraints.ts`), оценку (`scoring.ts`),
 * ранжирование (`ranking.ts`) и решение (`decision.ts`).
 */

export type RetrievalReasonCode = 'MATCH_EXACT_ALIAS' | 'MATCH_MODEL_CODE' | 'MATCH_FUZZY_FAMILY';

export type MatchReasonCode = RetrievalReasonCode | ConstraintRejectionCode | DecisionReasonCode;

export interface MatchIndex {
  readonly devicesById: ReadonlyMap<string, MatcherDevice>;
  readonly aliasIndex: AliasIndex;
  readonly trigramIndex: TrigramIndex;
}

/** Строит индексы отбора (точный + триграммный) из массива устройств справочника (ADR-005: в памяти). */
export function buildMatchIndex(devices: readonly MatcherDevice[]): MatchIndex {
  return {
    devicesById: new Map(devices.map((device) => [device.id, device])),
    aliasIndex: buildAliasIndex(devices),
    trigramIndex: buildTrigramIndex(devices),
  };
}

export interface RejectedCandidate {
  readonly device: MatcherDevice;
  readonly rejection: ConstraintRejection;
}

export interface MatchDecision {
  readonly status: DecisionStatus;
  readonly candidates: readonly ScoredCandidate[];
  /** Кандидаты, отклонённые жёсткими ограничениями (`constraints.ts`) — для отладки и трассировки (ADR-010). */
  readonly rejectedCandidates: readonly RejectedCandidate[];
  readonly reasons: readonly MatchReasonCode[];
}

export interface MatchOptions {
  /**
   * Нормализованная строка запроса ЦЕЛИКОМ, ДО слотового разбора — например `NormalizedQuery.normalized`
   * из `text-normalizer`. Нужна ТОЛЬКО для первой ступени отбора — точного индекса псевдонимов
   * (docs/04 §4.6): псевдонимы каталога (`device.aliases`, `device.marketingName`) — произвольный
   * свободный текст ("iphone 15 pro", "айфон 15 про", "13 pm"), который нельзя надёжно восстановить
   * из структурированных `QuerySlots` обратно (слотовый разбор — это разбор ВПЕРЁД, не обратимый).
   * Если строка не передана, первая ступень пропускается (кроме поиска по сервисному коду — он
   * всегда доступен через `slots.modelCode`, поскольку это отдельное типизированное поле), и
   * конвейер сразу переходит к триграммному отбору (§4.6, шаг R2) по тексту, построенному из слотов.
   */
  readonly queryText?: string;
  readonly weights?: ScoringWeights;
  readonly thresholds?: DecisionThresholds;
  readonly resolveEquivalenceKey?: (deviceId: string) => string;
  readonly constraints?: ConstraintOptions;
  readonly trigram?: FindTrigramCandidatesOptions;
}

interface RetrievedCandidates {
  readonly devices: readonly MatcherDevice[];
  readonly reason?: RetrievalReasonCode;
}

function retrieveCandidates(
  slots: QuerySlots,
  index: MatchIndex,
  options: MatchOptions,
): RetrievedCandidates {
  if (slots.modelCode !== undefined) {
    const device = lookupModelCode(index.aliasIndex, slots.modelCode);
    return device === undefined
      ? { devices: [] }
      : { devices: [device], reason: 'MATCH_MODEL_CODE' };
  }

  if (options.queryText !== undefined) {
    const device = lookupAlias(index.aliasIndex, options.queryText);
    if (device !== undefined) {
      return { devices: [device], reason: 'MATCH_EXACT_ALIAS' };
    }
  }

  const queryTrigramText = buildComparableQueryText(slots);
  if (queryTrigramText.length === 0) {
    return { devices: [] };
  }

  const deviceIds = findTrigramCandidates(index.trigramIndex, queryTrigramText, options.trigram);
  const devices: MatcherDevice[] = [];
  for (const deviceId of deviceIds) {
    const device = index.devicesById.get(deviceId);
    if (device !== undefined) {
      devices.push(device);
    }
  }

  return devices.length === 0 ? { devices: [] } : { devices, reason: 'MATCH_FUZZY_FAMILY' };
}

function applyConstraints(
  slots: QuerySlots,
  devices: readonly MatcherDevice[],
  constraintOptions: ConstraintOptions | undefined,
): { readonly passing: readonly MatcherDevice[]; readonly rejected: readonly RejectedCandidate[] } {
  const passing: MatcherDevice[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const device of devices) {
    const rejection = rejectCandidate(slots, device, constraintOptions);
    if (rejection === null) {
      passing.push(device);
    } else {
      rejected.push({ device, rejection });
    }
  }

  return { passing, rejected };
}

function buildDecisionOptions(options: MatchOptions): DecisionOptions {
  const thresholds = options.thresholds ?? DEFAULT_DECISION_THRESHOLDS;
  return {
    ...thresholds,
    ...(options.resolveEquivalenceKey !== undefined
      ? { resolveEquivalenceKey: options.resolveEquivalenceKey }
      : {}),
  };
}

/**
 * Полный конвейер §4.6—4.7: точный индекс → (при промахе) триграммный отбор → жёсткие ограничения
 * → оценка → ранжирование → решение. Каждый результат несёт стабильные коды причин в `reasons`:
 * ступень отбора (`MATCH_EXACT_ALIAS`/`MATCH_MODEL_CODE`/`MATCH_FUZZY_FAMILY`), сработавшие жёсткие
 * ограничения (`REJECT_*`, если какие-то кандидаты были отклонены) и код решения (`DECISION_*`).
 */
export function matchQuery(
  slots: QuerySlots,
  index: MatchIndex,
  options: MatchOptions = {},
): MatchDecision {
  const weights = options.weights ?? DEFAULT_SCORING_WEIGHTS;

  const retrieved = retrieveCandidates(slots, index, options);
  const { passing, rejected } = applyConstraints(slots, retrieved.devices, options.constraints);

  const scored = passing.map((device) => scoreCandidate(slots, device, weights));
  const ranked = rankCandidates(scored);
  const decision: Decision = decide(ranked, buildDecisionOptions(options));

  const rejectionCodes = [...new Set(rejected.map((entry) => entry.rejection.code))];
  const reasons: MatchReasonCode[] = [
    ...(retrieved.reason !== undefined ? [retrieved.reason] : []),
    ...rejectionCodes,
    ...decision.reasons,
  ];

  return {
    status: decision.status,
    candidates: decision.candidates,
    rejectedCandidates: rejected,
    reasons,
  };
}

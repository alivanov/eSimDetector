import type { ScoredCandidate } from './scoring';

/**
 * Правило принятия решения (docs/04-matching-algorithm.md, §4.7): решение принимается парой
 * «оценка лидера + разрыв со вторым кандидатом», а не абсолютной оценкой лидера в одиночку.
 */
export type DecisionStatus = 'determined' | 'clarification_required' | 'not_found';

export type DecisionReasonCode =
  | 'DECISION_GAP_TOO_SMALL'
  | 'DECISION_BELOW_THRESHOLD'
  | 'DECISION_NO_CANDIDATES'
  | 'DECISION_RESOLVED_BY_EQUIVALENCE';

export interface DecisionThresholds {
  /** Минимальная оценка лидера, при которой кандидат вообще может считаться определённым. */
  readonly confidenceThreshold: number;
  /** Минимальный разрыв между лидером и вторым кандидатом, при котором лидер не считается неоднозначным. */
  readonly gapThreshold: number;
  /** Сколько кандидатов включать в список для уточнения. По умолчанию `5`. */
  readonly maxClarificationCandidates?: number;
}

export interface DecisionOptions extends DecisionThresholds {
  /**
   * Ключ эквивалентности кандидатов, необязательный параметр (docs/04 §4.7: «если статус eSIM
   * совпадает у всех кандидатов, ответ выдаётся сразу»). Пакет `fuzzy-matcher` ничего не знает
   * про eSIM (AGENTS.md, «ЧЕГО НЕ ДЕЛАТЬ») — группировку по фактическому признаку эквивалентности
   * (например, статусу eSIM) подаёт вызывающая сторона (агент 3 / модуль `matching`). Если ВСЕ
   * кандидаты, которые иначе привели бы к `clarification_required`, отображаются в один и тот же
   * ключ, `decide` возвращает `determined` вместо уточнения — пользователю незачем отвечать на
   * вопрос, который не повлияет на результат.
   *
   * Согласие проверяется по полному набору кандидатов, прошедших отбор (близкие к лидеру — в
   * ветке «разрыв мал»; все отранжированные — в ветке «ниже порога»). `maxClarificationCandidates`
   * усекает только список, который кладётся в `Decision.candidates` для показа, и на проверку
   * согласия не влияет: иначе пять верхних с одним ключом скрыли бы шестого с другим.
   */
  readonly resolveEquivalenceKey?: (deviceId: string) => string;
}

const DEFAULT_MAX_CLARIFICATION_CANDIDATES = 5;

/** Пороги по умолчанию — консервативные (ADR-003): требуют и высокой оценки, и заметного разрыва. */
export const DEFAULT_DECISION_THRESHOLDS: DecisionThresholds = {
  confidenceThreshold: 0.72,
  gapThreshold: 0.08,
  maxClarificationCandidates: DEFAULT_MAX_CLARIFICATION_CANDIDATES,
};

export interface Decision {
  readonly status: DecisionStatus;
  /**
   * Набор для показа, а не набор, по которому проверялось согласие. Для `determined` — единственный
   * кандидат (либо усечённая группа эквивалентных, если решение получено через
   * `resolveEquivalenceKey` — тогда причина содержит `DECISION_RESOLVED_BY_EQUIVALENCE`, и
   * вызывающая сторона может судить о числе кандидатов сама). Для `clarification_required` —
   * кандидаты, которые стоит показать пользователю (не более `maxClarificationCandidates`). Для
   * `not_found` — пустой массив. Согласие по `resolveEquivalenceKey` считается по полному отобранному
   * набору до этого усечения.
   */
  readonly candidates: readonly ScoredCandidate[];
  readonly reasons: readonly DecisionReasonCode[];
}

function haveSameEquivalenceKey(
  candidates: readonly ScoredCandidate[],
  resolveEquivalenceKey: ((deviceId: string) => string) | undefined,
): boolean {
  if (resolveEquivalenceKey === undefined || candidates.length === 0) {
    return false;
  }
  const keys = new Set(candidates.map((candidate) => resolveEquivalenceKey(candidate.device.id)));
  return keys.size === 1;
}

/**
 * Принимает решение по таблице docs/04 §4.7 на основе уже отранжированных кандидатов
 * (`ranking.ts`). Список кандидатов может быть пустым (ничего не найдено ни точным индексом,
 * ни триграммным отбором, либо все найденные отклонены `rejectCandidate`) — в этом случае
 * ограничения и оценка уже не имеют значения, результат всегда `not_found` (AGENTS.md:
 * «неизвестное устройство никогда не получает догадку»).
 */
export function decide(
  rankedCandidates: readonly ScoredCandidate[],
  options: DecisionOptions = DEFAULT_DECISION_THRESHOLDS,
): Decision {
  const leader = rankedCandidates[0];
  if (leader === undefined) {
    return { status: 'not_found', candidates: [], reasons: ['DECISION_NO_CANDIDATES'] };
  }

  const maxCandidates = options.maxClarificationCandidates ?? DEFAULT_MAX_CLARIFICATION_CANDIDATES;
  const second = rankedCandidates[1];
  const gap = second === undefined ? leader.score : leader.score - second.score;

  const meetsConfidence = leader.score >= options.confidenceThreshold;
  const meetsGap = gap >= options.gapThreshold;

  if (meetsConfidence && meetsGap) {
    return { status: 'determined', candidates: [leader], reasons: [] };
  }

  if (meetsConfidence) {
    const closeCandidates = rankedCandidates.filter(
      (candidate) => leader.score - candidate.score < options.gapThreshold,
    );
    const shown = closeCandidates.slice(0, maxCandidates);

    if (haveSameEquivalenceKey(closeCandidates, options.resolveEquivalenceKey)) {
      return {
        status: 'determined',
        candidates: shown,
        reasons: ['DECISION_RESOLVED_BY_EQUIVALENCE'],
      };
    }
    return {
      status: 'clarification_required',
      candidates: shown,
      reasons: ['DECISION_GAP_TOO_SMALL'],
    };
  }

  const shown = rankedCandidates.slice(0, maxCandidates);
  if (haveSameEquivalenceKey(rankedCandidates, options.resolveEquivalenceKey)) {
    return {
      status: 'determined',
      candidates: shown,
      reasons: ['DECISION_RESOLVED_BY_EQUIVALENCE'],
    };
  }
  return {
    status: 'clarification_required',
    candidates: shown,
    reasons: ['DECISION_BELOW_THRESHOLD'],
  };
}

import type {
  CatalogAnswerPolicy,
  EsimReason,
  EsimResolution,
  EsimResolutionContext,
  ResultStatus,
} from '@esim-detector/contracts';
import { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

import { resolveDeviceEsimStatus, type EsimResolvableDevice } from './resolve-device-esim-status';

/**
 * Согласие статуса eSIM среди кандидатов группы (ADR-002, AGENTS.md, предметное правило 3;
 * docs/05-data-model.md §5.5). На iOS точная модель недостижима — сервис ищет минимальное
 * множество кандидатов и выдаёт однозначный ответ, только если статус eSIM совпадает у ВСЕХ
 * них (`exactModelKnown: false`). Реализовано как чистая функция здесь, а не только «в момент
 * ответа» в детекции (агент 5), потому что то же самое согласие требуется заранее посчитать
 * для `screen_signatures.esimConsensus` (docs/05 §5.5) — агенту 4 не нужно реализовывать
 * согласование статусов заново, достаточно вызвать эту функцию на кандидатах сигнатуры.
 */
export interface CandidateGroupResolution extends EsimResolution {
  readonly exactModelKnown: boolean;
}

export function resolveCandidateGroupEsimStatus(
  candidates: readonly EsimResolvableDevice[],
  context: EsimResolutionContext = {},
  policy: CatalogAnswerPolicy = DEFAULT_CATALOG_ANSWER_POLICY,
): CandidateGroupResolution {
  if (candidates.length === 0) {
    return {
      status: 'clarification_required',
      exactModelKnown: false,
      reasons: [{ code: 'CANDIDATES_DISAGREE_ON_ESIM', detail: 'Кандидатов нет' }],
    };
  }

  const perCandidate = candidates.map((candidate) =>
    resolveDeviceEsimStatus(candidate, context, policy),
  );
  const distinctStatuses = new Set(perCandidate.map((resolution) => resolution.status));
  const isUnanimous = distinctStatuses.size === 1;
  // Свёртка вместо индексации `perCandidate[0]` — при `isUnanimous` все элементы равны, поэтому
  // результат не зависит от порядка, а `noUncheckedIndexedAccess` не добавляет недостижимую
  // защитную ветку на `undefined`, которую нельзя было бы покрыть тестом (ADR-016: без `as`,
  // `.reduce` с явным типом аккумулятора и начальным значением — без `arr[0]`).
  const unanimousStatus = perCandidate.reduce<ResultStatus>(
    (_, resolution) => resolution.status,
    'clarification_required',
  );

  if (isUnanimous && unanimousStatus !== 'clarification_required') {
    const reasons: EsimReason[] = [
      {
        code: 'CANDIDATES_AGREE_ON_ESIM',
        detail: `${candidates.length} кандидат(ов), статус единый: "${unanimousStatus}"`,
      },
    ];
    return {
      status: unanimousStatus,
      exactModelKnown: candidates.length === 1,
      reasons,
    };
  }

  return {
    status: 'clarification_required',
    exactModelKnown: false,
    reasons: [
      {
        code: 'CANDIDATES_DISAGREE_ON_ESIM',
        detail: `${candidates.length} кандидат(ов), статус расходится`,
      },
    ],
  };
}

import type {
  CatalogAnswerPolicy,
  Device,
  EsimReason,
  EsimResolutionContext,
} from '@esim-detector/contracts';
import { resolveDeviceEsimStatus } from '@esim-detector/esim-rules';

/**
 * Разворачивает согласованный статус группы кандидатов (`resolveCandidateGroupEsimStatus`,
 * `@esim-detector/esim-rules`) до кода конкретного правила, которое его дало (ADR-010). Свёртка
 * группы намеренно возвращает только обобщённый `CANDIDATES_AGREE_ON_ESIM` (пакет не переписывается,
 * ADR-022 п.6) — без этой функции по ответу `/detect` нельзя было бы понять, применилось ли
 * условие по региону (`ESIM_CONDITION_MATCHED_REGION`) или общий случай `conditional`
 * (`ESIM_CONDITION_DEFAULT_SUPPORTED`), когда пользователь передал регион.
 *
 * Вызывается ТОЛЬКО когда `groupResolution.status !== 'clarification_required'` — кандидаты уже
 * согласны по построению, поэтому первое вхождение каждого кода репрезентативно для всей группы,
 * а дедупликация по коду убирает N одинаковых записей от N кандидатов с одним и тем же условием.
 */
export function collectGroupConditionReasons(
  candidates: readonly Device[],
  context: EsimResolutionContext,
  policy: CatalogAnswerPolicy,
): readonly EsimReason[] {
  const seenCodes = new Set<string>();
  const reasons: EsimReason[] = [];

  for (const candidate of candidates) {
    const resolution = resolveDeviceEsimStatus(candidate, context, policy);
    for (const reason of resolution.reasons) {
      if (!seenCodes.has(reason.code)) {
        seenCodes.add(reason.code);
        reasons.push(reason);
      }
    }
  }

  return reasons;
}

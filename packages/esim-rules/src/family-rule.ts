import type {
  CatalogAnswerPolicy,
  DataConfidence,
  EsimReason,
  ResultStatus,
} from '@esim-detector/contracts';
import { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

import { applyDataConfidenceGate } from './confidence-gate';

/**
 * Правило уровня линейки (ADR-021, docs/14-catalog-ingestion.md §14.4 шаг 7). Агрегат
 * вычисляется агентом 4 из принятых записей по паре «бренд + семейство» — этот пакет НЕ
 * вычисляет агрегат (для этого нужен полный справочник и его группировка), а только
 * реализует бизнес-правило "что с этим агрегатом разрешено сделать при ответе пользователю":
 * правило уровня линейки самостоятельно НЕ даёт `not_supported` без подтверждения модератором,
 * потому что ошибочное «не поддерживает» штрафуется критерием К1 так же, как ошибочное
 * «поддерживает» (ADR-021, .cursor/rules/catalog-data.mdc).
 */
export type FamilyEsimAggregateStatus = 'supported' | 'not_supported' | 'mixed';

export interface FamilyEsimRule {
  readonly brand: string;
  readonly family: string;
  readonly status: FamilyEsimAggregateStatus;
  readonly dataConfidence: DataConfidence;
  /** Число записей уровня не ниже `derived`, из которых получен агрегат (docs/14 §14.4 шаг 7). */
  readonly recordCount: number;
  /** `true`, только когда специалист явно подтвердил `not_supported` для этой линейки (ADR-021). */
  readonly moderatorConfirmed: boolean;
}

export interface FamilyRuleResolution {
  readonly status: ResultStatus;
  readonly reasons: readonly EsimReason[];
}

export function resolveFamilyRuleEsimStatus(
  rule: FamilyEsimRule,
  policy: CatalogAnswerPolicy = DEFAULT_CATALOG_ANSWER_POLICY,
): FamilyRuleResolution {
  if (rule.status === 'mixed') {
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'FAMILY_RULE_MIXED',
          detail: `Линейка "${rule.brand} ${rule.family}" содержит записи с разным статусом eSIM`,
        },
      ],
    };
  }

  if (rule.status === 'not_supported' && !rule.moderatorConfirmed) {
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'FAMILY_RULE_NOT_SUPPORTED_UNCONFIRMED',
          detail: `Правило "${rule.brand} ${rule.family}" даёт "not_supported", но не подтверждено модератором`,
        },
      ],
    };
  }

  const gated = applyDataConfidenceGate(rule.status, rule.dataConfidence, policy);
  return {
    status: gated.status,
    reasons: [
      {
        code: 'FAMILY_RULE_APPLIED',
        detail: `Правило уровня линейки "${rule.brand} ${rule.family}" по ${rule.recordCount} записям`,
      },
      ...gated.reasons,
    ],
  };
}

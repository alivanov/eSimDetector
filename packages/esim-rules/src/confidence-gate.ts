import type {
  CatalogAnswerPolicy,
  DataConfidence,
  EsimReason,
  ResultStatus,
} from '@esim-detector/contracts';
import { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

/**
 * Влияние `dataConfidence` на право отвечать (docs/14-catalog-ingestion.md, §14.4 шаг 7):
 * запись уровня `unverified` определяет устройство, но статуса eSIM в ответе не даёт —
 * это гейт ИМЕННО на статус (входной `status` мог быть уже вычислен `resolveEsimConditions`
 * и относиться к конкретному устройству), а не на факт распознавания устройства.
 *
 * Пороги/переключатели приходят параметром (`CatalogAnswerPolicy`), а не читаются из
 * `process.env` (.cursor/rules/pure-packages.mdc) — `apps/api` строит политику из `EnvConfig`.
 */
export interface ConfidenceGateResult {
  readonly status: ResultStatus;
  readonly reasons: readonly EsimReason[];
}

export function applyDataConfidenceGate(
  status: ResultStatus,
  dataConfidence: DataConfidence,
  policy: CatalogAnswerPolicy = DEFAULT_CATALOG_ANSWER_POLICY,
): ConfidenceGateResult {
  if (dataConfidence === 'quarantined') {
    // Защитная ветка: карантинные записи не должны попадать в рабочий справочник вообще
    // (docs/14 §14.4 шаг 7), но функция остаётся корректной и на таком входе, а не бросает исключение.
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'CATALOG_ENTRY_QUARANTINED_BLOCKED',
          detail: 'Запись карантина не участвует в ответах пользователю',
        },
      ],
    };
  }

  if (dataConfidence === 'unverified' && !policy.allowUnverifiedCatalogAnswers) {
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'CATALOG_ENTRY_UNVERIFIED_BLOCKED',
          detail: 'Устройство определено, но запись "unverified" статуса eSIM не даёт',
        },
      ],
    };
  }

  if (dataConfidence === 'derived' && !policy.allowDerivedCatalogAnswers) {
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'CATALOG_ENTRY_DERIVED_BLOCKED',
          detail: 'Ответы по записям уровня "derived" отключены конфигурацией',
        },
      ],
    };
  }

  const codeByConfidence: Record<'verified' | 'derived' | 'unverified', EsimReason['code']> = {
    verified: 'CATALOG_ENTRY_VERIFIED',
    derived: 'CATALOG_ENTRY_DERIVED',
    unverified: 'CATALOG_ENTRY_UNVERIFIED',
  };
  return {
    status,
    reasons: [
      {
        code: codeByConfidence[dataConfidence],
        detail: `Уровень достоверности записи: "${dataConfidence}"`,
      },
    ],
  };
}

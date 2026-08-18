import type {
  CatalogAnswerPolicy,
  DataConfidence,
  EsimInfo,
  EsimResolution,
  EsimResolutionContext,
} from '@esim-detector/contracts';
import { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

import { applyDataConfidenceGate } from './confidence-gate';
import { resolveEsimConditions } from './conditions';

/**
 * Минимальный структурный вход главной функции пакета — не полная запись `Device` из
 * `packages/contracts`, а только то, от чего реально зависит вывод статуса (симметрично
 * `MatcherDevice` пакета `fuzzy-matcher`): вызывающей стороне (агент 5, `matching`/`detection`)
 * не нужно собирать полную запись справочника, чтобы получить решение по статусу eSIM.
 */
export interface EsimResolvableDevice {
  readonly esim: EsimInfo;
  readonly dataConfidence: DataConfidence;
}

/**
 * Главная функция пакета — полный вывод статуса eSIM для одной записи (docs/05-data-model.md
 * §5.4, ADR-007, docs/14-catalog-ingestion.md §14.4 шаг 7): сначала разрешаются региональные
 * условия (`resolveEsimConditions`), затем результат проходит гейт достоверности данных
 * (`applyDataConfidenceGate`) — порядок важен: даже если условия дают однозначный статус,
 * запись `unverified`/`derived` без разрешения конфигурации всё равно уходит в уточнение.
 * Правило Apple по перечню поколений (`resolveAppleGenerationRule`) и правило уровня линейки
 * (`resolveFamilyRuleEsimStatus`) сюда не входят: они применяются ДО того, как появится
 * запись такой формы (агент 4, слияние с курируемым ядром, ADR-013 шаг 6/7), а не при каждом
 * запросе к уже готовой записи.
 */
export function resolveDeviceEsimStatus(
  device: EsimResolvableDevice,
  context: EsimResolutionContext = {},
  policy: CatalogAnswerPolicy = DEFAULT_CATALOG_ANSWER_POLICY,
): EsimResolution {
  const conditionResolution = resolveEsimConditions(device.esim, context);

  if (conditionResolution.status === 'clarification_required') {
    return {
      status: 'clarification_required',
      reasons: conditionResolution.reasons,
      ...(conditionResolution.clarification !== undefined
        ? { clarification: conditionResolution.clarification }
        : {}),
    };
  }

  const gated = applyDataConfidenceGate(conditionResolution.status, device.dataConfidence, policy);

  if (gated.status === 'clarification_required') {
    // Уточнение здесь вызвано НЕДОСТАТОЧНОЙ ДОСТОВЕРНОСТЬЮ записи (dataConfidence), а не
    // конкретным региональным вопросом — `clarifyingQuestion` устройства сюда не подходит:
    // пользователю нечего содержательно уточнить, кроме «проверить на устройстве» (docs/03 §3.7, п.4).
    return {
      status: 'clarification_required',
      reasons: [...conditionResolution.reasons, ...gated.reasons],
    };
  }

  return {
    status: gated.status,
    reasons: [...conditionResolution.reasons, ...gated.reasons],
  };
}

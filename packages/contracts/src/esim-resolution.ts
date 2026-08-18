import type { EsimClarifyingQuestion } from './device.schema';
import type { ResultStatus } from './enums';

export type { ResultStatus } from './enums';

/**
 * Тип результата вывода статуса eSIM (docs/09-decisions.md, ADR-011: «единственное объявление,
 * из которого выводятся... типы») — источник истины для `packages/esim-rules` (производитель)
 * и для будущих модулей `matching`/`detection` (агент 5, потребитель, собирающий из этого
 * результата финальный ответ `/api/v1/detect`/`/search` по docs/06-api-contract.md).
 *
 * Коды перечислены полностью здесь, а не в `esim-rules`, поскольку это стабильная часть
 * машиночитаемого объяснения ответа (ADR-010) — такая же часть контракта, как коды `MatchReasonCode`
 * пакета `fuzzy-matcher`.
 */
export type EsimReasonCode =
  /** `esim.support` уже не `conditional` — статус берётся из записи без разрешения условий. */
  | 'ESIM_STATUS_DIRECT'
  /** Сработало условие по региону (docs/05 §5.4, случаи 1 и 3). */
  | 'ESIM_CONDITION_MATCHED_REGION'
  /** Сработало условие по фактически вышедшей версии ОС (docs/05 §5.4, случай 4). */
  | 'ESIM_CONDITION_MATCHED_OS_VERSION'
  /** Ни одно условие не сработало — применён проектный default для `conditional` (docs/05 §5.4: «Исключения»). */
  | 'ESIM_CONDITION_DEFAULT_SUPPORTED'
  /** Контекста (регион/версия ОС) недостаточно, чтобы исключить хотя бы одно условие — уточнение (ADR-007). */
  | 'ESIM_CONDITION_CONTEXT_MISSING'
  /** Защитная ветка: `support: conditional`, но `conditions` пуст — нарушение инварианта §5.8 п.5. */
  | 'ESIM_CONDITION_INVALID_CONFIGURATION'
  /** Уровень достоверности записи не блокирует ответ (docs/14 §14.4 шаг 7). */
  | 'CATALOG_ENTRY_VERIFIED'
  | 'CATALOG_ENTRY_DERIVED'
  /** `unverified`, но `ALLOW_UNVERIFIED_CATALOG_ANSWERS` включён явно — ответ выдан пониженной достоверностью. */
  | 'CATALOG_ENTRY_UNVERIFIED'
  /** `unverified` при выключенном `ALLOW_UNVERIFIED_CATALOG_ANSWERS` — устройство определено, статуса нет. */
  | 'CATALOG_ENTRY_UNVERIFIED_BLOCKED'
  /** `derived` при выключенном `ALLOW_DERIVED_CATALOG_ANSWERS`. */
  | 'CATALOG_ENTRY_DERIVED_BLOCKED'
  /** Защитная ветка: `quarantined`-запись не должна доходить до вывода статуса вообще. */
  | 'CATALOG_ENTRY_QUARANTINED_BLOCKED'
  /** Правило уровня линейки (ADR-021): статус линейки расходится между принятыми записями. */
  | 'FAMILY_RULE_MIXED'
  /** Правило уровня линейки дало `not_supported`, но модератор его не подтвердил (ADR-021). */
  | 'FAMILY_RULE_NOT_SUPPORTED_UNCONFIRMED'
  | 'FAMILY_RULE_APPLIED'
  /** Детерминированное правило Apple по перечню поколений (docs/14 §14.4 шаг 6, п.3). */
  | 'APPLE_RULE_SUPPORTED'
  | 'APPLE_RULE_NOT_SUPPORTED'
  | 'APPLE_RULE_UNKNOWN_MODEL'
  /** Согласие кандидатов группы iOS (ADR-002, AGENTS.md, предметное правило 3). */
  | 'CANDIDATES_AGREE_ON_ESIM'
  | 'CANDIDATES_DISAGREE_ON_ESIM';

export interface EsimReason {
  readonly code: EsimReasonCode;
  readonly detail?: string;
}

/**
 * Контекст, известный вызывающей стороне на момент разрешения `esim.conditions` (docs/05 §5.4).
 * Оба поля не обязательны: их источник — уточняющий вопрос пользователю (ADR-007) либо сигналы
 * устройства (агент 5), которых на момент разрешения может не быть вовсе.
 */
export interface EsimResolutionContext {
  /** Код региона в любом регистре (например `"CN"`, `"cn"`) — сравнение регистронезависимое. */
  readonly region?: string;
  /** Версия ОС в виде точечной строки (`"15.0"`, `"18.5"`), как в User-Agent Safari. */
  readonly osVersion?: string;
}

/**
 * Итог разрешения `esim.support: conditional` (docs/05 §5.4, ADR-007). Отдельный тип от
 * `EsimResolution`: разрешение условий — только один из шагов полного вывода статуса
 * (`resolveDeviceEsimStatus`), и он не учитывает `dataConfidence` — это отдельный шаг конвейера.
 */
export interface ConditionResolution {
  readonly status: ResultStatus;
  readonly matchedCondition?: { readonly scope: string; readonly value: string };
  readonly reasons: readonly EsimReason[];
  readonly clarification?: EsimClarifyingQuestion;
}

/** Управление правом отвечать по записям пониженной достоверности (docs/14 §14.4 шаг 7). */
export interface CatalogAnswerPolicy {
  readonly allowDerivedCatalogAnswers: boolean;
  readonly allowUnverifiedCatalogAnswers: boolean;
}

/**
 * Значения по умолчанию (docs/14 §14.4 шаг 7: «`ALLOW_DERIVED_CATALOG_ANSWERS` (по умолчанию
 * включён) и `ALLOW_UNVERIFIED_CATALOG_ANSWERS` (по умолчанию выключен)»). Используются
 * функциями `esim-rules`, когда вызывающая сторона (тест, стенд оценки) не передаёт параметр
 * явно — переменные окружения сам пакет не читает (.cursor/rules/pure-packages.mdc).
 */
export const DEFAULT_CATALOG_ANSWER_POLICY: CatalogAnswerPolicy = {
  allowDerivedCatalogAnswers: true,
  allowUnverifiedCatalogAnswers: false,
};

/** Итог полного вывода статуса eSIM для одного устройства/группы кандидатов. */
export interface EsimResolution {
  readonly status: ResultStatus;
  readonly reasons: readonly EsimReason[];
  /** Заполнено, только когда `status === 'clarification_required'` по причине региональных условий. */
  readonly clarification?: EsimClarifyingQuestion;
}

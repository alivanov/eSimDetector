import type { DeviceType, EsimCondition, Platform } from '@esim-detector/contracts';

/** `esim_support` до слияния с курируемым ядром — тот же союз значений, что в CSV (docs/appendix-a §А.2). */
export type CsvEsimSupport = 'yes' | 'no' | 'conditional' | 'unknown';

/** Происхождение одной строки (docs/05-data-model.md §5.3: `provenance`). */
export interface RowProvenance {
  readonly source: string;
  readonly batchId: string;
  readonly importedAt: Date;
  readonly lineNumber: number;
}

/**
 * Кандидат в запись справочника (docs/14-catalog-ingestion.md §14.4, между шагами 3 и 4) —
 * прошёл нормализацию и валидацию ОДНОЙ строки ОДНОГО источника. Дальше по конвейеру несколько
 * кандидатов с одинаковым `id` из разных источников сравниваются шагом консенсуса (шаг 5).
 */
export interface DeviceCandidate {
  readonly id: string;
  readonly brand: string;
  readonly brandTitle: string;
  readonly marketingName: string;
  readonly family: string;
  readonly generation: number | null;
  readonly modifiers: readonly string[];
  readonly modelCodes: readonly string[];
  readonly platform: Platform;
  readonly deviceType: DeviceType;
  readonly releaseYear: number;
  readonly esimSupport: CsvEsimSupport;
  readonly esimConditions: readonly EsimCondition[];
  readonly dualSim?: string;
  readonly maxEsimProfiles?: number;
  readonly osMinVersion?: string;
  readonly osMaxVersion?: string;
  readonly ruMarket?: string;
  readonly sourceUrl?: string;
  readonly confidenceSelfReported?: 'high' | 'medium' | 'low';
  readonly notes?: string;
  readonly provenance: RowProvenance;
}

export type QuarantineCode =
  | 'FIELD_COUNT_MISMATCH'
  | 'ENUM_INVALID'
  | 'CONDITION_SYNTAX_INVALID'
  | 'BRAND_UNKNOWN'
  | 'NAME_UNPARSEABLE'
  | 'CODE_COLLISION'
  | 'NAME_COLLISION_CONFLICT'
  | 'YEAR_IMPLAUSIBLE'
  | 'ESIM_ANACHRONISM'
  | 'REFERENCE_MISMATCH'
  | 'SOURCE_DISAGREEMENT_UNRESOLVED'
  /** iOS без сигнатур экрана/`os.maxVersion` из курируемого ядра — запись не может быть загружена (§5.8 п.4). */
  | 'IOS_FIELDS_MISSING'
  /**
   * Запись нарушает один из инвариантов §5.8 (`CatalogInvariantCode`, `@esim-detector/contracts`)
   * ПОСЛЕ построения устройств — карантинится индивидуально (или парой, для инвариантов 2 и 3),
   * а не блокирует загрузку целиком (docs/09-decisions.md ADR-029, ADR-023 "Последствия").
   * Значения — коды самих инвариантов, переиспользуемые как есть (не самостоятельный набор), чтобы
   * разбивка карантина в отчёте (docs/14 §14.6) показывала тот же код, что напечатан в списке
   * нарушений, без дублирующего словаря соответствий.
   */
  | 'DUPLICATE_DEVICE_ID'
  | 'DUPLICATE_MODEL_CODE'
  | 'CONFLICTING_ALIAS'
  | 'IOS_SCREEN_SIGNATURES_MISSING'
  | 'IOS_MAX_VERSION_MISSING'
  | 'CONDITIONAL_CONDITIONS_MISSING'
  | 'CONDITIONAL_CLARIFYING_QUESTION_MISSING'
  | 'SUPPORTED_SOURCES_MISSING'
  | 'SCREEN_SIGNATURE_CONSENSUS_MISMATCH'
  | 'SCREEN_SIGNATURE_UNKNOWN_CANDIDATE';

export interface QuarantineEntry {
  readonly code: QuarantineCode;
  readonly source: string;
  readonly batchId: string;
  readonly lineNumber: number;
  readonly detail: string;
  /** Исходные значения строки — для примеров в отчёте (docs/14 §14.6) без повторного парсинга. */
  readonly rawBrand?: string;
  readonly rawMarketingName?: string;
}

/** Пометки, не отправляющие строку в карантин, но попадающие в отчёт (docs/14 §14.4 шаг 3). */
export type RowNoticeCode =
  | 'CODE_PATTERN_INVALID'
  | 'OS_VERSION_IMPLAUSIBLE'
  | 'SOURCE_MISSING'
  | 'APPLE_RULE_CONFLICT'
  | 'IOS_FIELDS_MISSING'
  /** Кандидат сведён к подбренду по совпадению сервисного кода (docs/09 ADR-029, `subbrand-merge.ts`). */
  | 'SUBBRAND_ALIAS_MERGED';

export interface RowNotice {
  readonly code: RowNoticeCode;
  readonly deviceId: string;
  readonly detail: string;
}

export interface ValidateRowResult {
  readonly candidate?: DeviceCandidate;
  readonly quarantine?: QuarantineEntry;
  readonly notices: readonly RowNotice[];
}

/**
 * Сводка по разбору партии 16 (`16-code-suffixes.csv`, docs/appendix-a §А.10) в отчёте конвейера
 * (agent 5.7). Партия 16 разбирается парсером `parseCodeSuffixesCsv`, но НЕ входит в правило
 * консенсуса §14.5 и не влияет на `devices`/`quarantine` итогового каталога (docs/appendix-a
 * §А.10, п.3: партия — генератор перечня кандидатов «суффикс → регион» для РУЧНОЙ сверки, а не
 * вход консенсуса) — эта сводка только фиксирует факт разбора и его объём в отчёте, как того
 * требует объём агента 5.7 ("достаточно разбора и строки в отчёте").
 */
export interface CodeSuffixBatchReport {
  readonly filesProcessed: number;
  readonly rowsParsed: number;
  readonly rowsQuarantined: number;
  readonly sources: readonly string[];
}

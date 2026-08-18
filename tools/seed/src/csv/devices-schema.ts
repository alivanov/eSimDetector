/**
 * Схема столбцов `devices.csv` (docs/appendix-a-llm-csv-request.md §А.2) как данные — порядок,
 * имена, обязательность и допустимые множества перечислимых полей. Используется и разбором
 * (позиционное восстановление при отсутствии заголовка), и восстановлением выравнивания
 * (docs/14-catalog-ingestion.md §14.3: "перечислимые поля имеют известные замкнутые наборы
 * значений" — этот файл и есть тот самый набор).
 */

export type DevicesCsvFieldKey =
  | 'brand'
  | 'marketingName'
  | 'modelCodes'
  | 'platform'
  | 'deviceType'
  | 'releaseYear'
  | 'esimSupport'
  | 'esimConditions'
  | 'dualSim'
  | 'maxEsimProfiles'
  | 'osMinVersion'
  | 'osMaxVersion'
  | 'ruMarket'
  | 'sourceUrl'
  | 'confidence'
  | 'notes';

export interface DevicesCsvColumn {
  readonly key: DevicesCsvFieldKey;
  readonly header: string;
  readonly required: boolean;
  /** `undefined` — свободное текстовое поле, замкнутого набора значений нет. */
  readonly enumValues?: readonly string[];
}

export const DEVICES_CSV_COLUMNS: readonly DevicesCsvColumn[] = [
  { key: 'brand', header: 'brand', required: true },
  { key: 'marketingName', header: 'marketing_name', required: true },
  { key: 'modelCodes', header: 'model_codes', required: false },
  {
    key: 'platform',
    header: 'platform',
    required: true,
    enumValues: ['ios', 'android', 'harmonyos', 'other'],
  },
  {
    key: 'deviceType',
    header: 'device_type',
    required: true,
    enumValues: ['phone', 'tablet', 'watch', 'laptop', 'other'],
  },
  { key: 'releaseYear', header: 'release_year', required: true },
  {
    key: 'esimSupport',
    header: 'esim_support',
    required: true,
    enumValues: ['yes', 'no', 'conditional', 'unknown'],
  },
  { key: 'esimConditions', header: 'esim_conditions', required: false },
  {
    key: 'dualSim',
    header: 'dual_sim',
    required: false,
    enumValues: ['physical+esim', 'dual-esim', 'esim-only', 'none', 'unknown'],
  },
  { key: 'maxEsimProfiles', header: 'max_esim_profiles', required: false },
  { key: 'osMinVersion', header: 'os_min_version', required: false },
  { key: 'osMaxVersion', header: 'os_max_version', required: false },
  {
    key: 'ruMarket',
    header: 'ru_market',
    required: false,
    enumValues: ['official', 'parallel', 'none', 'unknown'],
  },
  { key: 'sourceUrl', header: 'source_url', required: false },
  {
    key: 'confidence',
    header: 'confidence',
    required: true,
    enumValues: ['high', 'medium', 'low'],
  },
  { key: 'notes', header: 'notes', required: false },
];

export const DEVICES_CSV_COLUMN_COUNT = DEVICES_CSV_COLUMNS.length;

/**
 * Поля, которые определяют "опознание устройства и статус eSIM" в смысле таблицы §14.3:
 * восстановление выравнивания принимает строку ТОЛЬКО если все допустимые выравнивания
 * согласны по этим полям целиком — остальные поля обнуляются при расхождении.
 */
export const IDENTITY_FIELD_KEYS: readonly DevicesCsvFieldKey[] = [
  'brand',
  'marketingName',
  'modelCodes',
  'platform',
  'deviceType',
  'releaseYear',
  'esimSupport',
];

/** Синонимы булевых значений в перечислимых полях (docs/14 §14.3: "Да/Нет/true/1 вместо yes/no"). */
export const YES_NO_ALIASES: Readonly<Record<string, 'yes' | 'no'>> = {
  да: 'yes',
  нет: 'no',
  true: 'yes',
  false: 'no',
  '1': 'yes',
  '0': 'no',
};

export function normalizeEsimSupportToken(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  const alias = YES_NO_ALIASES[normalized];
  return alias ?? normalized;
}

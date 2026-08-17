/**
 * Типы предметной области пакета нормализации ввода (docs/04-matching-algorithm.md, §4.4).
 *
 * Типы слотового разбора (бренд/семейство/поколение/модификатор) сюда не входят —
 * это ответственность агента, реализующего конвейер `normalizeQuery` поверх этого пакета.
 */

/** Словарь синонимов и сокращений: токен запроса → последовательность канонических токенов. */
export type SynonymDictionary = Readonly<Record<string, readonly string[]>>;

/** Таблица односимвольного отображения: кириллический символ → латинская строка. */
export type CharacterMappingTable = Readonly<Record<string, string>>;

/** Незначимые атрибуты запроса: не участвуют в сопоставлении устройства, но сохраняются. */
export interface InsignificantAttributeDictionary {
  readonly storagePatterns: readonly string[];
  readonly colors: readonly string[];
  readonly networkMarkers: readonly string[];
  readonly dualSimMarkers: readonly string[];
}

/**
 * Словарь нормализации — источник знаний о предметной области (docs/04 §4.4,
 * .cursor/rules/pure-packages.mdc). Приходит параметром, пакет не хранит его сам
 * и не читает `data/catalog/aliases.json` напрямую.
 */
export interface NormalizationDictionary {
  readonly synonyms: SynonymDictionary;
  readonly transliteration: CharacterMappingTable;
  readonly keyboardLayout: CharacterMappingTable;
  readonly insignificantAttributes: InsignificantAttributeDictionary;
  readonly stopWords: readonly string[];
}

/** Незначимые атрибуты, извлечённые из запроса (наполняются на этапе слотового разбора). */
export interface QueryAttributes {
  readonly storage?: string;
  readonly color?: string;
  readonly network?: string;
  readonly dualSim?: boolean;
}

/** Идентификатор шага конвейера нормализации — для трассировки решения (ADR-010). */
export type NormalizationStepId =
  | 'unicode'
  | 'separators'
  | 'splitLettersAndDigits'
  | 'lookalikes'
  | 'keyboardLayout'
  | 'transliteration'
  | 'synonyms'
  | 'tokenize';

/** Один шаг трассировки: что было на входе и что получилось на выходе. */
export interface NormalizationTraceStep {
  readonly step: NormalizationStepId;
  readonly input: string;
  readonly output: string;
  readonly changed: boolean;
}

/** Полная трассировка конвейера нормализации одного запроса. */
export type NormalizationTrace = readonly NormalizationTraceStep[];

/**
 * Итог нормализации пользовательского запроса. Собирается конвейером `normalizeQuery`
 * поверх функций этого пакета — сам пакет такой конвейер не реализует.
 */
export interface NormalizedQuery {
  readonly raw: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
  readonly attributes: QueryAttributes;
  readonly trace: NormalizationTrace;
}

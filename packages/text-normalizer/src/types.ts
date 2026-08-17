/**
 * Типы предметной области пакета нормализации ввода (docs/04-matching-algorithm.md, §4.3—4.5).
 *
 * Типы слотового разбора (`QuerySlots`) реализованы в этом же пакете (`slots.ts`), а не
 * в модуле `matching` приложения: слотовый разбор зависит только от словаря, не знает
 * о кандидатах справочника и должен тестироваться и прогоняться эталонной выборкой без
 * поднятия приложения (ADR-001, ADR-019).
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
  readonly year?: number;
}

/** Идентификатор шага конвейера нормализации — для трассировки решения (ADR-010). */
export type NormalizationStepId =
  | 'unicode'
  | 'separators'
  | 'compoundSynonyms'
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
 * Результат слотового разбора нормализованного запроса (docs/04-matching-algorithm.md, §4.5).
 *
 * Поля `brand`/`family`/`generation`/`modifiers`/`modelCode` отсутствуют (не входят в объект),
 * когда соответствующая часть не распознана — `exactOptionalPropertyTypes` запрещает вместо
 * этого писать `undefined` в значение. `family` — в кебаб-кейсе (`galaxy-s`, `redmi-note`),
 * формат обязан совпадать с полем `family` справочника (docs/05-data-model.md, §5.3).
 *
 * `brand`/`family` — результат позиционной эвристики по токенам, а не поиска по справочнику
 * устройств (пакет его не знает, ADR-018/pure-packages.mdc): первый словесный токен — кандидат
 * в `brand`, остаток — кандидат в `family`; если словесный токен один (частый случай вида
 * `iphone 15`, где бренд `apple` в запросе не встречается вовсе), он используется для обоих
 * полей. Хирургическая точность этого разбора не гарантируется и не требуется: окончательное
 * сопоставление бренда и семейства с записями справочника — задача `fuzzy-matcher` (агенты
 * 2.3/2.4), которая обязана считаться с тем, что `brand` здесь может быть словом, отсутствующим
 * в списке брендов справочника (например `iphone` вместо `apple`).
 *
 * Числа поколения и модификаторы линейки сравниваются точно (docs/04 §4.2) — поэтому здесь
 * они выделены в собственные поля, а не остаются частью нечёткого текста `family`.
 */
export interface QuerySlots {
  readonly brand?: string;
  readonly family?: string;
  readonly generation?: number;
  readonly modifiers: readonly string[];
  readonly modelCode?: string;
  readonly attributes: QueryAttributes;
  readonly unparsed: readonly string[];
}

/** Параметры конвейера `normalizeQuery`. Все поля не обязательны и имеют безопасные значения по умолчанию. */
export interface NormalizeQueryOptions {
  /**
   * Пытаться ли распознать весь запрос как сервисный код модели (docs/04 §4.5) до общего
   * разбора. По умолчанию `true`. Отключается инструментами, которым нужен только текстовый
   * конвейер без этой ветки (например, нормализация значений `aliases` при построении индекса).
   */
  readonly detectModelCode?: boolean;
}

/**
 * Итог нормализации пользовательского запроса — полный конвейер по схеме docs/04 §4.3,
 * от сырой строки до слотового разбора включительно (`normalizeQuery`).
 */
export interface NormalizedQuery {
  readonly raw: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
  /** То же самое, что `slots.attributes` — вынесено на верхний уровень для удобства. */
  readonly attributes: QueryAttributes;
  readonly trace: NormalizationTrace;
  readonly slots: QuerySlots;
}

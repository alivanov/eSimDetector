import aliasesJson from '../../../data/catalog/aliases.json';
import appleCuratedJson from '../../../data/catalog/curated/apple-iphone.json';
import goldenQueriesJson from '../../../data/fixtures/queries.golden.json';
import type {
  NormalizationDictionary,
  QueryAttributes,
  QuerySlots,
} from '@esim-detector/text-normalizer';
import {
  parseNormalizationDictionary,
  normalizeQuery,
  expandCompoundSynonyms,
} from '@esim-detector/text-normalizer';

/**
 * Проверяет файлы данных `data/catalog/aliases.json` и `data/fixtures/queries.golden.json`
 * (docs/08-testing-and-quality.md, §8.4): словарь нормализации разбирается без ошибок,
 * эталонная выборка запросов соответствует ожидаемой форме, и слотовый разбор
 * `normalizeQuery` на настоящем словаре совпадает с зафиксированным в выборке результатом.
 *
 * Оба файла — внешние по отношению к коду данные (ADR-016): их форма проверяется вручную,
 * без утверждений `as`, а не принимается на веру из вывода `resolveJsonModule`.
 */

const EXPECTED_CATEGORIES: readonly string[] = [
  'canonical',
  'case-and-separators',
  'cyrillic',
  'abbreviations',
  'typos',
  'wrong-layout',
  'model-codes',
  'ambiguous',
  'extra-attributes',
  'no-esim-devices',
  'foreign-input',
];

const EXPECTED_OUTCOMES: readonly string[] = ['match', 'clarification', 'not_found'];

const KNOWN_ATTRIBUTE_KEYS: readonly string[] = ['storage', 'color', 'network', 'dualSim', 'year'];

const MIN_GOLDEN_QUERIES = 300;

interface GoldenSlots {
  readonly brand: string | null;
  readonly family: string | null;
  readonly generation: number | null;
  readonly modifiers: readonly string[];
  readonly modelCode: string | null;
  readonly attributes: QueryAttributes;
  readonly unparsed: readonly string[];
}

interface GoldenEntry {
  readonly id: string;
  readonly query: string;
  readonly category: string;
  readonly expectedOutcome: string;
  readonly expectedDeviceId: string | null;
  readonly expectedSlots: GoldenSlots;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

function parseAttributes(
  value: unknown,
  path: string,
  errors: string[],
): QueryAttributes | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }

  let valid = true;
  for (const key of Object.keys(value)) {
    if (!KNOWN_ATTRIBUTE_KEYS.includes(key)) {
      errors.push(`${path}.${key}: неизвестное поле атрибутов`);
      valid = false;
    }
  }

  const storage = value['storage'];
  if (storage !== undefined && !isString(storage)) {
    errors.push(`${path}.storage: ожидалась строка`);
    valid = false;
  }
  const color = value['color'];
  if (color !== undefined && !isString(color)) {
    errors.push(`${path}.color: ожидалась строка`);
    valid = false;
  }
  const network = value['network'];
  if (network !== undefined && !isString(network)) {
    errors.push(`${path}.network: ожидалась строка`);
    valid = false;
  }
  const dualSim = value['dualSim'];
  if (dualSim !== undefined && !isBoolean(dualSim)) {
    errors.push(`${path}.dualSim: ожидалось булево значение`);
    valid = false;
  }
  const year = value['year'];
  if (year !== undefined && !isNumber(year)) {
    errors.push(`${path}.year: ожидалось число`);
    valid = false;
  }

  if (!valid) {
    return undefined;
  }

  return {
    ...(isString(storage) ? { storage } : {}),
    ...(isString(color) ? { color } : {}),
    ...(isString(network) ? { network } : {}),
    ...(isBoolean(dualSim) ? { dualSim } : {}),
    ...(isNumber(year) ? { year } : {}),
  };
}

function parseGoldenSlots(value: unknown, path: string, errors: string[]): GoldenSlots | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }

  const brand = value['brand'];
  const family = value['family'];
  const generation = value['generation'];
  const modifiers = value['modifiers'];
  const modelCode = value['modelCode'];
  const unparsed = value['unparsed'];

  let valid = true;
  if (!isStringOrNull(brand)) {
    errors.push(`${path}.brand: ожидалась строка либо null`);
    valid = false;
  }
  if (!isStringOrNull(family)) {
    errors.push(`${path}.family: ожидалась строка либо null`);
    valid = false;
  }
  if (!isNumberOrNull(generation)) {
    errors.push(`${path}.generation: ожидалось число либо null`);
    valid = false;
  }
  if (!isStringArray(modifiers)) {
    errors.push(`${path}.modifiers: ожидался список строк`);
    valid = false;
  }
  if (!isStringOrNull(modelCode)) {
    errors.push(`${path}.modelCode: ожидалась строка либо null`);
    valid = false;
  }
  if (!isStringArray(unparsed)) {
    errors.push(`${path}.unparsed: ожидался список строк`);
    valid = false;
  }

  const attributes = parseAttributes(value['attributes'], `${path}.attributes`, errors);
  if (attributes === undefined) {
    valid = false;
  }

  if (
    !valid ||
    !isStringOrNull(brand) ||
    !isStringOrNull(family) ||
    !isNumberOrNull(generation) ||
    !isStringArray(modifiers) ||
    !isStringOrNull(modelCode) ||
    !isStringArray(unparsed) ||
    attributes === undefined
  ) {
    return undefined;
  }

  return { brand, family, generation, modifiers, modelCode, attributes, unparsed };
}

function parseGoldenEntry(
  value: unknown,
  index: number,
  errors: string[],
): GoldenEntry | undefined {
  const path = `[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }

  const id = value['id'];
  if (!isString(id) || id.trim().length === 0) {
    errors.push(`${path}.id: ожидалась непустая строка`);
    return undefined;
  }

  const query = value['query'];
  if (!isString(query)) {
    errors.push(`${path}.query: ожидалась строка`);
    return undefined;
  }

  const category = value['category'];
  if (!isString(category) || !EXPECTED_CATEGORIES.includes(category)) {
    errors.push(`${path}.category: недопустимая категория ${JSON.stringify(category)}`);
    return undefined;
  }

  const expectedOutcome = value['expectedOutcome'];
  if (!isString(expectedOutcome) || !EXPECTED_OUTCOMES.includes(expectedOutcome)) {
    errors.push(
      `${path}.expectedOutcome: недопустимое значение ${JSON.stringify(expectedOutcome)}`,
    );
    return undefined;
  }

  const expectedDeviceId = value['expectedDeviceId'];
  if (!isStringOrNull(expectedDeviceId)) {
    errors.push(`${path}.expectedDeviceId: ожидалась строка либо null`);
    return undefined;
  }

  const expectedSlots = parseGoldenSlots(value['expectedSlots'], `${path}.expectedSlots`, errors);
  if (expectedSlots === undefined) {
    return undefined;
  }

  return { id, query, category, expectedOutcome, expectedDeviceId, expectedSlots };
}

function parseGoldenEntries(value: unknown): {
  entries: readonly GoldenEntry[];
  errors: readonly string[];
} {
  if (!Array.isArray(value)) {
    return { entries: [], errors: ['ожидался массив записей'] };
  }

  const errors: string[] = [];
  const entries: GoldenEntry[] = [];
  value.forEach((item, index) => {
    const entry = parseGoldenEntry(item, index, errors);
    if (entry !== undefined) {
      entries.push(entry);
    }
  });

  return { entries, errors };
}

function dictionary(): NormalizationDictionary {
  const result = parseNormalizationDictionary(aliasesJson);
  if (!result.ok) {
    throw new Error(
      `data/catalog/aliases.json не прошёл валидацию: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

/** Приводит результат `parseSlots` к той же форме, что записана в фикстуре: `undefined` → `null`. */
function toGoldenSlots(slots: QuerySlots): GoldenSlots {
  return {
    brand: slots.brand ?? null,
    family: slots.family ?? null,
    generation: slots.generation ?? null,
    modifiers: slots.modifiers,
    modelCode: slots.modelCode ?? null,
    attributes: slots.attributes,
    unparsed: slots.unparsed,
  };
}

describe('data/catalog/aliases.json', () => {
  it('проходит parseNormalizationDictionary без ошибок', () => {
    const result = parseNormalizationDictionary(aliasesJson);

    if (!result.ok) {
      throw new Error(
        `data/catalog/aliases.json не прошёл валидацию: ${JSON.stringify(result.errors)}`,
      );
    }

    expect(result.ok).toBe(true);
  });
});

/**
 * Ни один ключ словаря синонимов не должен быть мёртвым грузом (docs/04 §4.10.1): находка
 * агента 2.5 показала, что смешанные буквенно-цифровые сокращения (`s23u`, `с23`) были
 * недостижимы при обычном порядке конвейера, поскольку `splitLettersAndDigits` разбивал такой
 * токен на части раньше, чем словарь успевал его увидеть целиком. `expandCompoundSynonyms`
 * (`normalize-query.ts`, ранний проход ДО `splitLettersAndDigits`) устраняет эту проблему —
 * этот тест проверяет по НАСТОЯЩЕМУ словарю `data/catalog/aliases.json`, что КАЖДЫЙ такой ключ
 * действительно раскрывается, а не просто "теоретически должен".
 */
describe('словарь синонимов: смешанные буквенно-цифровые ключи достижимы (docs/04 §4.10.1)', () => {
  const dict = dictionary();
  const mixedAlphanumericKeys = Object.keys(dict.synonyms).filter(
    (key) => /\p{L}/u.test(key) && /\p{Nd}/u.test(key),
  );

  it('в словаре есть хотя бы один смешанный буквенно-цифровой ключ (иначе тест ничего не проверяет)', () => {
    expect(mixedAlphanumericKeys.length).toBeGreaterThan(0);
  });

  it.each(mixedAlphanumericKeys)(
    'expandCompoundSynonyms раскрывает ключ "%s" целиком, ДО splitLettersAndDigits',
    (key) => {
      const expansion = dict.synonyms[key];
      expect(expandCompoundSynonyms([key], dict)).toEqual(expansion);
    },
  );

  it.each(mixedAlphanumericKeys)(
    'normalizeQuery на ключе "%s" не оставляет исходный смешанный токен в unparsed',
    (key) => {
      const result = normalizeQuery(key, dict);
      expect(result.slots.unparsed).not.toContain(key);
    },
  );
});

describe('data/fixtures/queries.golden.json', () => {
  // `goldenQueriesJson` типизирован `resolveJsonModule` по фактическому содержимому файла —
  // присваивание переменной с явным типом `unknown` не сужает и не расширяет значение через
  // `as` (ADR-016 запрещает утверждения типа именно на этой границе), а лишь заставляет
  // дальнейший код пройти через ручную проверку формы, как и для любых внешних данных.
  const rawValue: unknown = goldenQueriesJson;
  const { entries, errors } = parseGoldenEntries(rawValue);

  it('целиком соответствует ожидаемой форме записи', () => {
    if (errors.length > 0) {
      throw new Error(
        `data/fixtures/queries.golden.json не прошёл валидацию:\n${errors.join('\n')}`,
      );
    }
    expect(errors).toEqual([]);
    expect(Array.isArray(rawValue) ? rawValue.length : -1).toBe(entries.length);
  });

  it(`содержит не менее ${MIN_GOLDEN_QUERIES} записей`, () => {
    expect(entries.length).toBeGreaterThanOrEqual(MIN_GOLDEN_QUERIES);
  });

  it('содержит все 11 категорий из docs/08-testing-and-quality.md §8.4, каждая непуста', () => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }

    for (const category of EXPECTED_CATEGORIES) {
      expect(counts.get(category) ?? 0).toBeGreaterThan(0);
    }
    expect(counts.size).toBe(EXPECTED_CATEGORIES.length);
  });

  it('идентификаторы записей уникальны', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('категории ambiguous и foreign-input не содержат expectedDeviceId', () => {
    const violations = entries.filter(
      (entry) =>
        (entry.category === 'ambiguous' || entry.category === 'foreign-input') &&
        entry.expectedDeviceId !== null,
    );
    expect(violations).toEqual([]);
  });

  describe('normalizeQuery(query, dict).slots совпадает с expectedSlots', () => {
    const dict = dictionary();

    it.each(entries.map((entry): [string, GoldenEntry] => [entry.id, entry]))(
      '%s',
      (_id, entry) => {
        const actual = toGoldenSlots(normalizeQuery(entry.query, dict).slots);
        expect(actual).toEqual(entry.expectedSlots);
      },
    );
  });

  /**
   * Идентификаторы `expectedDeviceId` эталонной выборки — контракт между выборкой и справочником:
   * стенд оценки качества (docs/04 §4.10) сверяет с ними результат сопоставления. Пока справочник
   * не покрывал платформу `ios`, эти ожидания были принципиально недостижимы (docs/04 §4.10.1);
   * с появлением курируемого ядра Apple (ADR-030) они стали проверяемыми, и этот тест фиксирует
   * согласованность имён: переименование записи ядра ломает выборку молча, если не проверять.
   */
  it('каждый ожидаемый выборкой идентификатор Apple существует в курируемом ядре', () => {
    const curatedIds = new Set(appleCuratedJson.map((device) => device._id));
    const expectedAppleIds = [
      ...new Set(
        entries
          .map((entry) => entry.expectedDeviceId)
          .filter((id): id is string => id !== null && id.startsWith('apple-')),
      ),
    ];

    expect(expectedAppleIds.length).toBeGreaterThan(0);
    expect(expectedAppleIds.filter((id) => !curatedIds.has(id))).toEqual([]);
  });
});

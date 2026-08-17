import type { NormalizationDictionary, QueryAttributes } from './types';
import { transliterateCyrillic } from './transliterate';

/**
 * Выделение и удаление незначимых атрибутов запроса (docs/04-matching-algorithm.md, §4.4
 * последняя строка таблицы, и §4.5): объём памяти, цвет, признак сети (`5G`), признак
 * двух SIM, год. Атрибуты исключаются из дальнейшего сопоставления бренда/семейства, но
 * сохраняются в результате — `dualSim`, в частности, сигнал к уточнению по региональному
 * варианту (docs/04 §4.5), а не шум, который можно просто выбросить.
 *
 * Ограничение задачи, ради которого этот модуль не сводится к разбору по словам: числовой
 * токен объёма или сети никогда не должен попасть в generation слотового разбора. `256Gb` и
 * `5G` доходят до этой функции УЖЕ разделёнными на цифру и букву — `splitLettersAndDigits`
 * разбивает границу "буква ↔ цифра" раньше в конвейере (см. split-letters-digits.ts), поэтому
 * `256gb` — это два соседних токена `["256", "gb"]`, а `5g` — `["5", "g"]`. Отсюда сопоставление
 * идёт "окном" из одного или двух соседних токенов, склеенных без разделителя, а не поиском
 * одного токена целиком.
 */

/** Результат извлечения атрибутов: сами атрибуты и токены, из которых их убрали. */
export interface AttributeExtractionResult {
  readonly attributes: QueryAttributes;
  readonly remainingTokens: readonly string[];
}

/** Год выпуска устройства: обычный диапазон XXI века. Поколение устройства всегда короче. */
const YEAR_PATTERN = /^20\d{2}$/;

/** Убирает пробелы и дефисы, приводя многословный образец словаря к виду "слипшегося" токена. */
function collapseSeparators(value: string): string {
  return value.replace(/[\s-]+/g, '');
}

/**
 * Строит множество для сравнения по образцам словаря в обеих формах — как есть и
 * транслитерированной. Двойная форма нужна, чтобы функция одинаково работала и на токенах
 * до транслитерации (кириллические `черный`, `две сим`), и после неё (конвейер
 * `normalizeQuery` вызывает транслитерацию раньше, чем эту функцию, — см. normalize-query.ts).
 */
function buildPatternSet(
  patterns: readonly string[],
  transliteration: NormalizationDictionary['transliteration'],
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    result.add(collapseSeparators(lower));
    result.add(collapseSeparators(transliterateCyrillic(lower, transliteration)));
  }
  return result;
}

interface AttributePatternSets {
  readonly storage: ReadonlySet<string>;
  readonly network: ReadonlySet<string>;
  readonly dualSim: ReadonlySet<string>;
  readonly color: ReadonlySet<string>;
}

function buildPatternSets(dictionary: NormalizationDictionary): AttributePatternSets {
  return {
    storage: buildPatternSet(
      dictionary.insignificantAttributes.storagePatterns,
      dictionary.transliteration,
    ),
    network: buildPatternSet(
      dictionary.insignificantAttributes.networkMarkers,
      dictionary.transliteration,
    ),
    dualSim: buildPatternSet(
      dictionary.insignificantAttributes.dualSimMarkers,
      dictionary.transliteration,
    ),
    color: buildPatternSet(dictionary.insignificantAttributes.colors, dictionary.transliteration),
  };
}

type AttributeCategory = 'storage' | 'network' | 'dualSim' | 'color' | 'year';

interface WindowMatch {
  readonly category: AttributeCategory;
  readonly value: string;
  readonly length: number;
}

function windowKey(tokens: readonly string[], start: number, length: number): string | undefined {
  if (start + length > tokens.length) {
    return undefined;
  }
  return tokens
    .slice(start, start + length)
    .join('')
    .toLowerCase();
}

/** Пытается сопоставить окно из `length` токенов, начиная с `start`, с одной из категорий атрибутов. */
function matchWindow(
  tokens: readonly string[],
  start: number,
  length: number,
  sets: AttributePatternSets,
): WindowMatch | undefined {
  const key = windowKey(tokens, start, length);
  if (key === undefined) {
    return undefined;
  }

  if (sets.storage.has(key)) {
    return { category: 'storage', value: key, length };
  }
  if (sets.network.has(key)) {
    return { category: 'network', value: key, length };
  }
  if (sets.dualSim.has(key)) {
    return { category: 'dualSim', value: key, length };
  }
  if (sets.color.has(key)) {
    return { category: 'color', value: key, length };
  }
  if (length === 1 && YEAR_PATTERN.test(key)) {
    return { category: 'year', value: key, length };
  }
  return undefined;
}

/**
 * Извлекает незначимые атрибуты из токенов и возвращает оставшиеся токены отдельно.
 * Сканирование идёт слева направо, на каждой позиции сначала пробуется окно из двух
 * токенов (объём памяти и сеть после `splitLettersAndDigits` — всегда два токена), затем
 * из одного. Если ни одна категория не подошла, токен переносится в `remainingTokens`
 * без изменений — это ровно то поведение, которое требуется от слотового разбора: токен,
 * которого нет в словаре, не выбрасывается и не переинтерпретируется.
 */
export function extractAttributes(
  tokens: readonly string[],
  dictionary: NormalizationDictionary,
): AttributeExtractionResult {
  const sets = buildPatternSets(dictionary);

  let storage: string | undefined;
  let network: string | undefined;
  let dualSim: boolean | undefined;
  let color: string | undefined;
  let year: number | undefined;

  const remainingTokens: string[] = [];
  // Итератор вместо индексной адресации `tokens[index]`: значение пары из `entries()`
  // приходит из деструктуризации результата итератора, а не индексированием массива,
  // поэтому `noUncheckedIndexedAccess` не добавляет сюда недостижимую ветку `undefined` —
  // внутри цикла `index` всегда указывает на существующий токен по построению итератора.
  const iterator = tokens.entries();
  let step = iterator.next();
  while (!step.done) {
    const [index, token] = step.value;
    const match = matchWindow(tokens, index, 2, sets) ?? matchWindow(tokens, index, 1, sets);

    if (match === undefined) {
      remainingTokens.push(token);
      step = iterator.next();
      continue;
    }

    switch (match.category) {
      case 'storage':
        storage = match.value;
        break;
      case 'network':
        network = match.value;
        break;
      case 'dualSim':
        dualSim = true;
        break;
      case 'color':
        color = match.value;
        break;
      case 'year':
        year = Number(match.value);
        break;
    }
    for (let skipped = 0; skipped < match.length; skipped += 1) {
      step = iterator.next();
    }
  }

  const attributes: QueryAttributes = {
    ...(storage !== undefined ? { storage } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(network !== undefined ? { network } : {}),
    ...(dualSim !== undefined ? { dualSim } : {}),
    ...(year !== undefined ? { year } : {}),
  };

  return { attributes, remainingTokens };
}

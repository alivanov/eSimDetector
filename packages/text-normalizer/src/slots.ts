import type { NormalizationDictionary, QuerySlots } from './types';
import { extractAttributes } from './attributes';
import { transliterateCyrillic } from './transliterate';

/**
 * Слотовый разбор нормализованного запроса (docs/04-matching-algorithm.md, §4.5): бренд,
 * семейство, поколение, модификаторы линейки, атрибуты, неразобранный остаток. Часть шага
 * "Слотовый разбор" схемы §4.3 — выполняется ДО отбора кандидатов и ничего не знает о
 * справочнике устройств (ADR-019).
 *
 * Модификаторы линейки — фиксированный, не зависящий от вендора словарь терминологии
 * (docs/04 §4.2: Pro, Pro Max, Plus, Ultra, mini, FE, Lite, Air, Fold, Flip, a), а не знание
 * о конкретных устройствах, поэтому в отличие от `NormalizationDictionary` он не вынесен в
 * data/catalog/aliases.json — это не даёт связки "одна модель = один вход", как справочник.
 */
const LINE_MODIFIERS: ReadonlySet<string> = new Set([
  'pro',
  'max',
  'plus',
  'ultra',
  'mini',
  'fe',
  'lite',
  'air',
  'fold',
  'flip',
  'a',
]);

/** Поколение — целое число, ЦЕЛИКОМ состоящее из цифр (жёсткое, а не нечёткое сравнение — docs/04 §4.2). */
const GENERATION_PATTERN = /^\d+$/;

/** Кандидат в бренд/семейство — слово из латинских букв без цифр. */
const WORD_PATTERN = /^[a-z]+$/;

/**
 * Множество стоп-слов в обеих формах (как есть и транслитерированной) — та же причина, что
 * и в attributes.ts: словарь хранит стоп-слова кириллицей, а к моменту слотового разбора
 * токены конвейера `normalizeQuery` уже транслитерированы.
 */
function buildStopWordSet(dictionary: NormalizationDictionary): ReadonlySet<string> {
  const result = new Set<string>();
  for (const word of dictionary.stopWords) {
    const lower = word.toLowerCase();
    result.add(lower);
    result.add(transliterateCyrillic(lower, dictionary.transliteration));
  }
  return result;
}

interface BrandAndFamily {
  readonly brand?: string;
  readonly family?: string;
}

/**
 * Первый словесный токен — кандидат в бренд, остаток (в кебаб-кейсе, docs/05 §5.3) —
 * кандидат в семейство. Если словесный токен один (`iphone 15 pro` — бренд `apple` в
 * запросе не встречается вовсе), он используется для обоих полей: иначе семейство осталось
 * бы пустым именно в самом частом случае ввода. См. подробное ограничение в QuerySlots
 * (types.ts) — это позиционная эвристика, а не проверка по справочнику брендов.
 */
function splitBrandAndFamily(wordTokens: readonly string[]): BrandAndFamily {
  const first = wordTokens[0];
  if (first === undefined) {
    return {};
  }

  const rest = wordTokens.slice(1);
  if (rest.length === 0) {
    return { brand: first, family: first };
  }
  return { brand: first, family: rest.join('-') };
}

export function parseSlots(
  tokens: readonly string[],
  dictionary: NormalizationDictionary,
): QuerySlots {
  const { attributes, remainingTokens } = extractAttributes(tokens, dictionary);

  const stopWords = buildStopWordSet(dictionary);
  const meaningfulTokens = remainingTokens.filter((token) => !stopWords.has(token));

  const modifiers: string[] = [];
  const withoutModifiers: string[] = [];
  for (const token of meaningfulTokens) {
    if (LINE_MODIFIERS.has(token)) {
      modifiers.push(token);
    } else {
      withoutModifiers.push(token);
    }
  }

  let generation: number | undefined;
  const withoutGeneration: string[] = [];
  for (const token of withoutModifiers) {
    if (generation === undefined && GENERATION_PATTERN.test(token)) {
      generation = Number(token);
    } else {
      withoutGeneration.push(token);
    }
  }

  const wordTokens: string[] = [];
  const unparsed: string[] = [];
  for (const token of withoutGeneration) {
    if (WORD_PATTERN.test(token)) {
      wordTokens.push(token);
    } else {
      unparsed.push(token);
    }
  }

  const { brand, family } = splitBrandAndFamily(wordTokens);

  return {
    ...(brand !== undefined ? { brand } : {}),
    ...(family !== undefined ? { family } : {}),
    ...(generation !== undefined ? { generation } : {}),
    modifiers,
    attributes,
    unparsed,
  };
}

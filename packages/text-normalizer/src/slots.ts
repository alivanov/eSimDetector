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
 * Модификаторы, для которых имеет смысл проверять "испорченное" (на одну правку) написание —
 * ИСКЛЮЧАЯ короткие `a` и `fe`: у однобуквенных и двухбуквенных строк слишком много соседей на
 * расстоянии одной правки (например, `s` от `a` — обычный второй словесный токен запроса вида
 * `galaxy s23`, а не опечатка в модификаторе), поэтому проверка по ним даёт ложные срабатывания
 * на самых обычных запросах, а не на опечатках (см. AGENTS.md, предметное правило 1: нельзя
 * "чинить" неуверенность выдумыванием структуры, которой не было).
 */
const TYPO_CHECKABLE_MODIFIERS: readonly string[] = [...LINE_MODIFIERS].filter(
  (modifier) => modifier.length >= 3,
);

/**
 * Правда ли, что `token` отличается от `modifier` РОВНО на одну правку — вставку, удаление,
 * замену символа или транспозицию двух соседних символов (тот же набор операций, что и
 * OSA-вариант расстояния Дамерау—Левенштейна в `fuzzy-matcher`, ADR-018 относит этот примитив
 * сразу к обоим пакетам). Реализован здесь заново, а не импортирован из `fuzzy-matcher`:
 * обратная зависимость недопустима (`fuzzy-matcher` уже зависит от `text-normalizer` ради
 * `QuerySlots`, ADR-019) — и не нужна: этому пакету достаточно ответа "да/нет" на короткой
 * фиксированной строке модификатора, а не полной матрицы расстояний ради ранжирования.
 */
function isSingleEditAway(token: string, modifier: string): boolean {
  const lengthDiff = token.length - modifier.length;
  if (lengthDiff < -1 || lengthDiff > 1) {
    return false;
  }

  if (lengthDiff === 0) {
    let firstMismatch = -1;
    let secondMismatch = -1;
    for (let index = 0; index < token.length; index += 1) {
      if (token.charAt(index) === modifier.charAt(index)) {
        continue;
      }
      if (firstMismatch === -1) {
        firstMismatch = index;
      } else if (secondMismatch === -1) {
        secondMismatch = index;
      } else {
        return false;
      }
    }
    if (firstMismatch === -1) {
      return false; // строки совпадают целиком — это не опечатка, а точное совпадение
    }
    if (secondMismatch === -1) {
      return true; // ровно одна замена символа
    }
    return (
      secondMismatch === firstMismatch + 1 &&
      token.charAt(firstMismatch) === modifier.charAt(secondMismatch) &&
      token.charAt(secondMismatch) === modifier.charAt(firstMismatch)
    );
  }

  const longer = lengthDiff > 0 ? token : modifier;
  const shorter = lengthDiff > 0 ? modifier : token;
  let longerIndex = 0;
  let shorterIndex = 0;
  let usedSkip = false;
  while (longerIndex < longer.length && shorterIndex < shorter.length) {
    if (longer.charAt(longerIndex) === shorter.charAt(shorterIndex)) {
      longerIndex += 1;
      shorterIndex += 1;
      continue;
    }
    if (usedSkip) {
      return false;
    }
    usedSkip = true;
    longerIndex += 1;
  }
  return true; // остаток (не более одного символа) — это и есть допустимая вставка/удаление
}

/**
 * Похож ли словесный токен на модификатор с опечаткой (`amx` на `max`, `rpo`/`por` на `pro`,
 * `ultr` на `ultra`) — AGENTS.md, предметное правило 1: испорченный токен, недостаточно похожий
 * ни на что известное, не должен молча стать частью `family`. Короткие токены (< 3 символов)
 * не проверяются по той же причине, что и короткие модификаторы в `TYPO_CHECKABLE_MODIFIERS`.
 *
 * ВАЖНО: это НЕ попытка исправить опечатку и признать модификатор распознанным — наоборот,
 * найденное совпадение исключает токен из `family` (см. `parseSlots`) и он остаётся видимым
 * поводом для уточнения в `unparsed`, а не тихо превращается в подтверждённый модификатор.
 * Уверенность вместо неуверенности здесь не создаётся ни в одну, ни в другую сторону.
 */
function looksLikeCorruptedModifier(token: string): boolean {
  if (token.length < 3) {
    return false;
  }
  return TYPO_CHECKABLE_MODIFIERS.some((modifier) => isSingleEditAway(token, modifier));
}

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

  // Индекс словесного токена (а не индекс в `withoutGeneration`) — испорченный модификатор
  // проверяется только СРЕДИ словесных токенов, начиная со второго: первый словесный токен —
  // всегда кандидат в бренд (см. `splitBrandAndFamily`), и его не с чем спутать с
  // модификатором линейки, который по построению запроса идёт позже (docs/04 §4.2, §4.5).
  const wordTokens: string[] = [];
  const unparsed: string[] = [];
  let wordTokenPosition = 0;
  for (const token of withoutGeneration) {
    if (!WORD_PATTERN.test(token)) {
      unparsed.push(token);
      continue;
    }
    if (wordTokenPosition > 0 && looksLikeCorruptedModifier(token)) {
      // Не модификатор (иначе он совпал бы точно и ушёл бы в `modifiers` выше) и не часть
      // семейства — испорченный токен обязан остаться видимым поводом для уточнения, а не
      // молча раствориться в `family` (AGENTS.md, предметное правило 1; дефект "amx").
      unparsed.push(token);
    } else {
      wordTokens.push(token);
    }
    wordTokenPosition += 1;
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

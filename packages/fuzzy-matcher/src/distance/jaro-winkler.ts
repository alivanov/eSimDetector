/**
 * Мера Джаро—Винклера (docs/04-matching-algorithm.md, §4.6: «даёт вес совпадению начала строки»).
 * Применяется ТОЛЬКО к текстовым частям — названию бренда и названию семейства (AGENTS.md,
 * предметное правило 2), никогда — к числу поколения или модификаторам.
 */

/** Окно поиска совпадающих символов по классическому определению меры Джаро. */
function matchWindow(lengthA: number, lengthB: number): number {
  return Math.max(Math.floor(Math.max(lengthA, lengthB) / 2) - 1, 0);
}

/**
 * Мера Джаро: доля совпадающих символов в пределах окна с поправкой на транспозиции. Симметрична
 * по построению — роли `a` и `b` в определении совпадений и транспозиций взаимозаменяемы.
 * Пустые строки: обе пустые — схожесть `1` (идентичны), одна пустая — `0` (общих символов нет).
 */
export function jaroSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const window = matchWindow(a.length, b.length);

  const matchedInA = new Set<number>();
  const matchedInB = new Set<number>();

  for (let indexA = 0; indexA < a.length; indexA += 1) {
    const start = Math.max(0, indexA - window);
    const end = Math.min(indexA + window + 1, b.length);
    for (let indexB = start; indexB < end; indexB += 1) {
      if (matchedInB.has(indexB)) {
        continue;
      }
      if (a.charAt(indexA) !== b.charAt(indexB)) {
        continue;
      }
      matchedInA.add(indexA);
      matchedInB.add(indexB);
      break;
    }
  }

  const matchCount = matchedInA.size;
  if (matchCount === 0) {
    return 0;
  }

  const sortedMatchedInB = [...matchedInB].sort((left, right) => left - right);

  let transpositions = 0;
  let cursor = 0;
  for (let indexA = 0; indexA < a.length; indexA += 1) {
    if (!matchedInA.has(indexA)) {
      continue;
    }
    const indexB = sortedMatchedInB[cursor];
    cursor += 1;
    // `cursor` пробегает ровно `matchedInB.size === matchCount` позиций — столько же раз, сколько
    // раз выполняется этот блок (по числу элементов `matchedInA`), поэтому `indexB` не выходит за
    // границы `sortedMatchedInB` по построению; проверка ниже — явная обработка `undefined`
    // вместо утверждения типа (`noUncheckedIndexedAccess`, ADR-016), а не признак того, что это
    // действительно может произойти.
    /* istanbul ignore if -- недостижимо по инварианту, описанному в комментарии выше. */
    if (indexB === undefined) {
      continue;
    }
    if (a.charAt(indexA) !== b.charAt(indexB)) {
      transpositions += 1;
    }
  }

  const halfTranspositions = transpositions / 2;
  return (
    (matchCount / a.length +
      matchCount / b.length +
      (matchCount - halfTranspositions) / matchCount) /
    3
  );
}

/** Настройки веса совпадения начала строки. Значения по умолчанию — классические (Winkler, 1990). */
export interface JaroWinklerOptions {
  /** Множитель вклада общего префикса. Стандартное значение — `0.1`. */
  readonly prefixScale?: number;
  /** Максимальная длина учитываемого префикса. Стандартное значение — `4`. */
  readonly maxPrefixLength?: number;
}

const DEFAULT_PREFIX_SCALE = 0.1;
const DEFAULT_MAX_PREFIX_LENGTH = 4;

/**
 * Мера Джаро—Винклера: мера Джаро с надбавкой за общий префикс строк (до `maxPrefixLength`
 * символов) — чем длиннее совпадающее начало, тем выше итоговая схожесть. Это ровно тот вклад,
 * ради которого мера выбрана для сопоставления названий (docs/04 §4.6): опечатка в конце слова
 * («айфон» → «айфан») не должна перевешивать полностью иное начало слова.
 */
export function jaroWinklerSimilarity(
  a: string,
  b: string,
  options: JaroWinklerOptions = {},
): number {
  const jaro = jaroSimilarity(a, b);
  const prefixScale = options.prefixScale ?? DEFAULT_PREFIX_SCALE;
  const maxPrefixLength = options.maxPrefixLength ?? DEFAULT_MAX_PREFIX_LENGTH;

  const limit = Math.min(a.length, b.length, maxPrefixLength);
  let prefixLength = 0;
  while (prefixLength < limit && a.charAt(prefixLength) === b.charAt(prefixLength)) {
    prefixLength += 1;
  }

  return jaro + prefixLength * prefixScale * (1 - jaro);
}

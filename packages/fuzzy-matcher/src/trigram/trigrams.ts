/**
 * Триграммы с краевыми заполнителями (docs/04-matching-algorithm.md, §4.6: «инвертированный
 * триграммный индекс»). Применяется ТОЛЬКО к текстовым частям — названию бренда и семейства
 * (AGENTS.md, предметное правило 2) — эта функция сама по себе работает с любой строкой, но
 * ответственность за то, ЧТО ей передают (буквенная часть без цифр и модификаторов), лежит на
 * вызывающем коде (`trigram/inverted-index.ts` в этом пакете).
 *
 * Краевые заполнители — по два пробела с каждой стороны, что даёт вес началу и концу строки:
 * без них триграмма «первые три буквы» не отличалась бы по значимости от триграммы из середины
 * длинного слова, а начало слова обычно наиболее устойчиво к опечаткам при быстром наборе.
 */
const EDGE_PADDING = '  ';

/**
 * Извлекает все триграммы (подстроки длины 3) из строки, дополненной краевыми заполнителями.
 *
 * Проверка длины после заполнения не нужна: `EDGE_PADDING` добавляется с обеих сторон, поэтому
 * `padded.length` не может быть меньше `2 * EDGE_PADDING.length === 4` даже для пустой строки —
 * цикл ниже всегда выполняется хотя бы раз.
 */
export function extractTrigrams(value: string): readonly string[] {
  const padded = `${EDGE_PADDING}${value.toLowerCase()}${EDGE_PADDING}`;

  const trigrams: string[] = [];
  for (let index = 0; index <= padded.length - 3; index += 1) {
    trigrams.push(padded.slice(index, index + 3));
  }
  return trigrams;
}

/**
 * Триграммная схожесть двух строк — коэффициент Жаккара по множествам триграмм: доля общих
 * триграмм среди всех различных триграмм обеих строк. `1` — множества триграмм совпадают
 * (в частности, строки идентичны или обе пусты), `0` — общих триграмм нет.
 */
export function trigramSimilarity(a: string, b: string): number {
  const trigramsA = new Set(extractTrigrams(a));
  const trigramsB = new Set(extractTrigrams(b));

  let intersectionSize = 0;
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) {
      intersectionSize += 1;
    }
  }

  const unionSize = trigramsA.size + trigramsB.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

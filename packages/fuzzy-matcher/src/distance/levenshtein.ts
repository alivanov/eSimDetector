/**
 * Расстояние редактирования с учётом транспозиции соседних символов (docs/04-matching-algorithm.md,
 * §4.6: «расстояние Дамерау—Левенштейна ... учитывает транспозицию соседних символов — самый
 * частый тип опечатки при быстром наборе»).
 *
 * ВАЖНАЯ ОГОВОРКА (ADR-018, зафиксировано также в docs/04): здесь реализован вариант **OSA**
 * (Optimal String Alignment), а не полное расстояние Дамерау—Левенштейна. Разница: OSA запрещает
 * повторно редактировать подстроку, уже участвовавшую в транспозиции (каждая пара символов может
 * быть переставлена не более одного раза за проход), тогда как полный алгоритм Дамерау—Левенштейна
 * допускает неограниченные последовательные транспозиции одной и той же подстроки и требует более
 * дорогой реализации (учёт последнего вхождения каждого символа). Для задачи этого пакета —
 * распознавание одиночной опечатки вида «переставлены два соседних символа» в названии бренда или
 * семейства — разницы между вариантами нет: она проявляется только на специально сконструированных
 * строках с несколькими пересекающимися транспозициями, которых не бывает в реальном пользовательском
 * вводе. Выбор OSA, а не полного алгоритма — сознательное упрощение, а не недосмотр.
 *
 * Применяется ТОЛЬКО к текстовым частям — названию бренда и названию семейства (AGENTS.md,
 * предметное правило 2; docs/04 §4.2). Числа поколения и модификаторы линейки сравниваются точно
 * где-то ещё (агент 2.4) и никогда не должны попадать в аргументы этой функции.
 */

/**
 * Читает ячейку матрицы расстояний с явной проверкой границ вместо утверждения типа —
 * `noUncheckedIndexedAccess` добавляет `undefined` к результату индексации массива массивов,
 * и здесь это по-настоящему важно: тихая подстановка произвольного числа при ошибке в границах
 * маскировала бы баг в самом алгоритме расстояния (ADR-016).
 */
function readCell(matrix: readonly (readonly number[])[], row: number, column: number): number {
  const matrixRow = matrix[row];
  /* istanbul ignore if -- недостижимо: алгоритм ниже всегда обращается по row/column в пределах
   * построенной матрицы (0..lengthA, 0..lengthB); проверка остаётся как защита от будущей ошибки
   * в самом алгоритме, а не как ветка, которую можно спровоцировать корректным вызовом извне. */
  if (matrixRow === undefined) {
    throw new Error(`строка матрицы расстояний вне диапазона: ${row}`);
  }
  const value = matrixRow[column];
  /* istanbul ignore if -- см. пояснение выше, тот же инвариант для столбца. */
  if (value === undefined) {
    throw new Error(`столбец матрицы расстояний вне диапазона: ${column}`);
  }
  return value;
}

function writeCell(matrix: number[][], row: number, column: number, value: number): void {
  const matrixRow = matrix[row];
  /* istanbul ignore if -- см. пояснение в readCell выше, тот же инвариант границ. */
  if (matrixRow === undefined) {
    throw new Error(`строка матрицы расстояний вне диапазона: ${row}`);
  }
  matrixRow[column] = value;
}

/**
 * Расстояние редактирования между двумя строками: вставка, удаление, замена символа — по цене 1,
 * транспозиция двух соседних символов — тоже по цене 1 (вариант OSA, см. пояснение выше).
 *
 * Симметрична: `damerauLevenshteinDistance(a, b) === damerauLevenshteinDistance(b, a)` — сравнение
 * симметрично по построению (каждая операция обратима операцией той же цены).
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const lengthA = a.length;
  const lengthB = b.length;

  if (lengthA === 0) {
    return lengthB;
  }
  if (lengthB === 0) {
    return lengthA;
  }

  const matrix: number[][] = [];
  for (let row = 0; row <= lengthA; row += 1) {
    matrix.push(new Array<number>(lengthB + 1).fill(0));
  }
  for (let row = 0; row <= lengthA; row += 1) {
    writeCell(matrix, row, 0, row);
  }
  for (let column = 0; column <= lengthB; column += 1) {
    writeCell(matrix, 0, column, column);
  }

  for (let row = 1; row <= lengthA; row += 1) {
    for (let column = 1; column <= lengthB; column += 1) {
      const substitutionCost = a.charAt(row - 1) === b.charAt(column - 1) ? 0 : 1;

      const deletion = readCell(matrix, row - 1, column) + 1;
      const insertion = readCell(matrix, row, column - 1) + 1;
      const substitution = readCell(matrix, row - 1, column - 1) + substitutionCost;
      let best = Math.min(deletion, insertion, substitution);

      const canTranspose =
        row > 1 &&
        column > 1 &&
        a.charAt(row - 1) === b.charAt(column - 2) &&
        a.charAt(row - 2) === b.charAt(column - 1);
      if (canTranspose) {
        const transposition = readCell(matrix, row - 2, column - 2) + 1;
        best = Math.min(best, transposition);
      }

      writeCell(matrix, row, column, best);
    }
  }

  return readCell(matrix, lengthA, lengthB);
}

/**
 * Схожесть на основе расстояния редактирования, нормированная в `[0, 1]`: `1` — строки идентичны,
 * `0` — не имеют ничего общего с точки зрения меры расстояния. Две пустые строки считаются
 * идентичными (схожесть `1`), а сравнение пустой строки с непустой даёт `0` только когда непустая
 * строка длиннее самой себя не может быть — то есть по формуле `1 - distance / maxLength`.
 */
export function editSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - damerauLevenshteinDistance(a, b) / maxLength;
}

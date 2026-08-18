/**
 * Восстановление строки с неверным числом полей перебором допустимых выравниваний
 * (docs/14-catalog-ingestion.md §14.3). Идея: перечислимые поля имеют замкнутые множества
 * значений — выравнивание допустимо, если после него ВСЕ перечислимые поля попадают в свои
 * множества. Дальше решает не число вариантов, а их согласие (см. таблицу §14.3):
 *
 * - Допустимого выравнивания не существует → карантин `FIELD_COUNT_MISMATCH`.
 * - Все допустимые выравнивания согласны по "полям опознания" (`identityIndexes`) → строка
 *   принимается по ним; поля, где выравнивания расходятся, обнуляются (не совпавшие с
 *   решением — потеря сведений, а не догадка).
 * - Выравнивания расходятся хотя бы в одном поле опознания → карантин `FIELD_COUNT_MISMATCH`
 *   (это тот самый случай "неоднозначность в статусе eSIM либо в опознании устройства").
 *
 * Функция ничего не знает про домен (devices.csv/code-suffixes.csv) — только про массив полей
 * и описание столбцов (`RealignColumn`), поэтому пригодна для обеих схем.
 */

export interface RealignColumn {
  readonly key: string;
  readonly required: boolean;
  readonly enumValues?: readonly string[];
}

export type RealignOutcome =
  | { readonly status: 'exact'; readonly fields: readonly string[] }
  | {
      readonly status: 'recovered';
      /** `undefined` — поле обнулено из-за расхождения допустимых выравниваний. */
      readonly fields: readonly (string | undefined)[];
    }
  | { readonly status: 'unresolvable'; readonly detail: string };

/** Число полей за пределами лимита комбинаций не перебирается — защита от комбинаторного взрыва. */
const MAX_COMBINATIONS_EVALUATED = 4000;

/** Все k-подмножества индексов `0..n-1`, в порядке возрастания — используется как для вставки, так и для удаления. */
function combinations(n: number, k: number): number[][] {
  if (k < 0 || k > n) {
    return [];
  }
  if (k === 0) {
    return [[]];
  }
  const result: number[][] = [];
  const current: number[] = [];

  function backtrack(start: number): void {
    if (result.length >= MAX_COMBINATIONS_EVALUATED) {
      return;
    }
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < n; index += 1) {
      current.push(index);
      backtrack(index + 1);
      current.pop();
      if (result.length >= MAX_COMBINATIONS_EVALUATED) {
        return;
      }
    }
  }

  backtrack(0);
  return result;
}

/** Строит финальный массив длины `columns.length`, вставляя пустые строки в позиции `insertPositions`. */
function buildByInsertingEmpties(rawFields: readonly string[], insertPositions: readonly number[]): string[] {
  const insertSet = new Set(insertPositions);
  const result: string[] = [];
  let rawIndex = 0;
  for (let finalIndex = 0; result.length < rawFields.length + insertPositions.length; finalIndex += 1) {
    if (insertSet.has(finalIndex)) {
      result.push('');
    } else {
      const value = rawFields[rawIndex];
      result.push(value ?? '');
      rawIndex += 1;
    }
  }
  return result;
}

/** Строит финальный массив, удаляя пустые поля по индексам `removeIndexes` (в исходном `rawFields`). */
function buildByRemoving(rawFields: readonly string[], removeIndexes: readonly number[]): string[] {
  const removeSet = new Set(removeIndexes);
  return rawFields.filter((_, index) => !removeSet.has(index));
}

function normalizeForEnumCheck(value: string): string {
  return value.trim().toLowerCase();
}

/** Значение поля соответствует его описанию столбца (пусто допустимо для необязательных перечислимых полей). */
function fieldMatchesColumn(value: string, column: RealignColumn): boolean {
  if (column.enumValues === undefined) {
    return true;
  }
  const normalized = normalizeForEnumCheck(value);
  if (normalized.length === 0) {
    return !column.required;
  }
  return column.enumValues.some((allowed) => allowed === normalized);
}

function candidateIsValid(fields: readonly string[], columns: readonly RealignColumn[]): boolean {
  return columns.every((column, index) => fieldMatchesColumn(fields[index] ?? '', column));
}

function candidateKey(fields: readonly string[]): string {
  return JSON.stringify(fields);
}

function buildCandidates(rawFields: readonly string[], columnCount: number): readonly string[][] {
  const delta = rawFields.length - columnCount;
  if (delta === 0) {
    return [[...rawFields]];
  }

  if (delta > 0) {
    // Слишком много полей: (а) хвост мог "разъехаться" из-за незакрытой кавычки/неэкранированной
    // запятой в `notes` — склеиваем хвост назад; (б) кто-то из полей — лишнее пустое поле.
    const candidates: string[][] = [];
    const tailMerged = [
      ...rawFields.slice(0, columnCount - 1),
      rawFields.slice(columnCount - 1).join(','),
    ];
    candidates.push(tailMerged);

    const emptyIndexes = rawFields.reduce<number[]>((acc, value, index) => {
      if (value === '') {
        acc.push(index);
      }
      return acc;
    }, []);
    for (const removeIndexes of combinations(emptyIndexes.length, delta)) {
      const actualIndexes = removeIndexes.map((position) => {
        const value = emptyIndexes[position];
        if (value === undefined) {
          throw new Error('Внутренняя ошибка: индекс комбинации вне диапазона пустых полей');
        }
        return value;
      });
      candidates.push(buildByRemoving(rawFields, actualIndexes));
    }
    return candidates;
  }

  // delta < 0: не хватает полей — перебираем позиции, куда могло быть вставлено пропущенное пустое поле.
  const missing = -delta;
  const candidates: string[][] = [];
  for (const insertPositions of combinations(columnCount, missing)) {
    candidates.push(buildByInsertingEmpties(rawFields, insertPositions));
  }
  return candidates;
}

export function realignFields(
  rawFields: readonly string[],
  columns: readonly RealignColumn[],
  identityIndexes: readonly number[],
): RealignOutcome {
  if (rawFields.length === columns.length) {
    return { status: 'exact', fields: rawFields };
  }

  const candidates = buildCandidates(rawFields, columns.length);
  const validCandidates: string[][] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidateIsValid(candidate, columns)) {
      continue;
    }
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    validCandidates.push(candidate);
  }

  if (validCandidates.length === 0) {
    return {
      status: 'unresolvable',
      detail: `Число полей ${rawFields.length} вместо ${columns.length}: допустимого выравнивания не найдено`,
    };
  }

  const firstCandidate = validCandidates[0];
  if (firstCandidate === undefined) {
    throw new Error('Внутренняя ошибка: пустой список допустимых выравниваний после проверки длины');
  }

  const identityAgrees = identityIndexes.every((index) =>
    validCandidates.every((candidate) => candidate[index] === firstCandidate[index]),
  );

  if (!identityAgrees) {
    return {
      status: 'unresolvable',
      detail: 'Допустимые выравнивания расходятся в опознании устройства либо в статусе eSIM',
    };
  }

  const fields: (string | undefined)[] = columns.map((_, index) => {
    const allAgree = validCandidates.every((candidate) => candidate[index] === firstCandidate[index]);
    return allAgree ? firstCandidate[index] : undefined;
  });

  return { status: 'recovered', fields };
}

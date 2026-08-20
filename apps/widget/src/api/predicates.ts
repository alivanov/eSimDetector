/**
 * Общие предикаты для разбора недоверенного JSON, пришедшего с границы API (ADR-016: без
 * утверждений `as`, тип появляется только после проверки формы значения). Образец стиля —
 * `tools/eval/src/signals-golden.ts`, тот же приём для другого внешнего источника (файла
 * эталонной выборки) применён здесь к сетевому ответу.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArrayOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is readonly T[] {
  return Array.isArray(value) && value.every(isItem);
}

/** Необязательное поле: отсутствует ИЛИ проходит предикат — используется для опциональных строк ответа. */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

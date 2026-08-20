import {
  isArrayOf,
  isBoolean,
  isFiniteNumber,
  isNonEmptyString,
  isOptionalString,
  isRecord,
  isString,
} from './predicates';

describe('predicates', () => {
  it('isRecord: объект, не массив, не null', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  it('isString/isNonEmptyString', () => {
    expect(isString('a')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('a')).toBe(true);
  });

  it('isFiniteNumber', () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });

  it('isBoolean', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean('true')).toBe(false);
  });

  it('isArrayOf', () => {
    expect(isArrayOf(['a', 'b'], isString)).toBe(true);
    expect(isArrayOf(['a', 1], isString)).toBe(false);
    expect(isArrayOf('a', isString)).toBe(false);
  });

  it('isOptionalString', () => {
    expect(isOptionalString(undefined)).toBe(true);
    expect(isOptionalString('a')).toBe(true);
    expect(isOptionalString(1)).toBe(false);
  });
});

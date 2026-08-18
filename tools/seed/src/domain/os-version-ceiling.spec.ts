import { extractMajorVersion, parseOsVersionCeilings } from './os-version-ceiling';

describe('parseOsVersionCeilings', () => {
  it('разбирает корректный объект', () => {
    const result = parseOsVersionCeilings({ android: 16, ios: 18 });
    expect(result).toEqual({ ok: true, value: { android: 16, ios: 18 } });
  });

  it('отклоняет значение, не являющееся объектом', () => {
    expect(parseOsVersionCeilings('not an object').ok).toBe(false);
    expect(parseOsVersionCeilings(null).ok).toBe(false);
    expect(parseOsVersionCeilings([1, 2]).ok).toBe(false);
  });

  it('отклоняет отсутствующие или неположительные числовые поля', () => {
    expect(parseOsVersionCeilings({ android: 16 }).ok).toBe(false);
    expect(parseOsVersionCeilings({ android: -1, ios: 18 }).ok).toBe(false);
    expect(parseOsVersionCeilings({ android: '16', ios: 18 }).ok).toBe(false);
  });
});

describe('extractMajorVersion', () => {
  it('извлекает целое число', () => {
    expect(extractMajorVersion('Android 14')).toBe(14);
  });

  it('извлекает число с плавающей точкой', () => {
    expect(extractMajorVersion('14.5')).toBe(14.5);
  });

  it('возвращает undefined, если в строке нет числа', () => {
    expect(extractMajorVersion('нет версии')).toBeUndefined();
  });
});

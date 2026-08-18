import { compareVersionStrings, isVersionWithinRange } from './os-version-range';

describe('compareVersionStrings', () => {
  it('сравнивает численно, а не лексикографически ("9.0" < "15.0")', () => {
    expect(compareVersionStrings('9.0', '15.0')).toBeLessThan(0);
  });

  it('возвращает 0 для равных версий', () => {
    expect(compareVersionStrings('18.5', '18.5')).toBe(0);
  });

  it('корректно сравнивает версии разной длины сегментов', () => {
    expect(compareVersionStrings('18.5', '18.5.1')).toBeLessThan(0);
    expect(compareVersionStrings('18.5.1', '18.5')).toBeGreaterThan(0);
  });
});

describe('isVersionWithinRange', () => {
  it('true, когда версия в пределах [min, max]', () => {
    expect(isVersionWithinRange('12.0', { minVersion: '9.0', maxVersion: '15.8' })).toBe(true);
  });

  it('false, когда версия выше максимально вышедшей для устройства (устройство не может её получить)', () => {
    expect(isVersionWithinRange('18.0', { minVersion: '9.0', maxVersion: '15.8' })).toBe(false);
  });

  it('false, когда версия ниже версии, с которой устройство было выпущено', () => {
    expect(isVersionWithinRange('8.0', { minVersion: '9.0', maxVersion: '15.8' })).toBe(false);
  });

  it('null-границы не ограничивают (значение неизвестно/неприменимо)', () => {
    expect(isVersionWithinRange('26.0', { minVersion: null, maxVersion: null })).toBe(true);
  });
});

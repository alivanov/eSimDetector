import { jaroSimilarity, jaroWinklerSimilarity } from './jaro-winkler';

describe('jaroSimilarity', () => {
  it('известное значение: "martha" / "marhta" ≈ 0.944 (классический пример меры Джаро)', () => {
    expect(jaroSimilarity('martha', 'marhta')).toBeCloseTo(0.9444, 3);
  });

  it('известное значение: "dwayne" / "duane" ≈ 0.822', () => {
    expect(jaroSimilarity('dwayne', 'duane')).toBeCloseTo(0.8222, 3);
  });

  it('единичная схожесть для идентичных строк, включая две пустые строки', () => {
    expect(jaroSimilarity('samsung', 'samsung')).toBe(1);
    expect(jaroSimilarity('', '')).toBe(1);
  });

  it('нулевая схожесть, если одна из строк пустая, а другая — нет', () => {
    expect(jaroSimilarity('', 'samsung')).toBe(0);
    expect(jaroSimilarity('samsung', '')).toBe(0);
  });

  it('нулевая схожесть для строк без общих символов', () => {
    expect(jaroSimilarity('abc', 'xyz')).toBe(0);
  });

  it('симметрична: схожесть не зависит от порядка аргументов', () => {
    expect(jaroSimilarity('iphone', 'ipone')).toBeCloseTo(jaroSimilarity('ipone', 'iphone'), 10);
  });
});

describe('jaroWinklerSimilarity', () => {
  it('вклад общего префикса: с совпадающим началом схожесть выше, чем чистая мера Джаро', () => {
    const jaro = jaroSimilarity('martha', 'marhta');
    const jaroWinkler = jaroWinklerSimilarity('martha', 'marhta');

    expect(jaroWinkler).toBeGreaterThan(jaro);
  });

  it('известное значение с надбавкой по умолчанию: "martha" / "marhta" ≈ 0.9611', () => {
    expect(jaroWinklerSimilarity('martha', 'marhta')).toBeCloseTo(0.9611, 3);
  });

  it('без общего префикса совпадает с чистой мерой Джаро', () => {
    expect(jaroWinklerSimilarity('abc', 'xyz')).toBe(jaroSimilarity('abc', 'xyz'));
  });

  it('надбавка ограничена максимальной длиной префикса (по умолчанию 4 символа)', () => {
    // Общий префикс "samsun" длиной 6, но по умолчанию учитываются только первые 4 символа —
    // с явным увеличением предела надбавка должна вырасти на том же самом входе.
    const withDefaultLimit = jaroWinklerSimilarity('samsung', 'samsuny');
    const withHigherLimit = jaroWinklerSimilarity('samsung', 'samsuny', { maxPrefixLength: 6 });

    expect(withHigherLimit).toBeGreaterThan(withDefaultLimit);
  });

  it('надбавку можно настроить параметрами (масштаб и максимальная длина префикса)', () => {
    const withDefaultOptions = jaroWinklerSimilarity('martha', 'marhta');
    const withZeroScale = jaroWinklerSimilarity('martha', 'marhta', { prefixScale: 0 });
    const withCustomMaxPrefix = jaroWinklerSimilarity('martha', 'marhta', { maxPrefixLength: 1 });

    expect(withZeroScale).toBe(jaroSimilarity('martha', 'marhta'));
    expect(withCustomMaxPrefix).toBeLessThan(withDefaultOptions);
  });

  it('единичная схожесть для идентичных строк, включая две пустые строки', () => {
    expect(jaroWinklerSimilarity('honor', 'honor')).toBe(1);
    expect(jaroWinklerSimilarity('', '')).toBe(1);
  });
});

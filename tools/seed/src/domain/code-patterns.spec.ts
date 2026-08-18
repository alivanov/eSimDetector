import { parseCodePatterns, validateModelCode } from './code-patterns';

describe('parseCodePatterns', () => {
  it('разбирает шаблоны по брендам', () => {
    const result = parseCodePatterns({ samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    expect(result.errors).toEqual([]);
    expect(result.patterns.get('samsung')).toBeInstanceOf(RegExp);
  });

  it('отклоняет значение, не являющееся объектом', () => {
    const result = parseCodePatterns('строка');
    expect(result.patterns.size).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('пропускает метаполя, начинающиеся с "_"', () => {
    const result = parseCodePatterns({ _comment: 'пояснение', samsung: '^SM-.*$' });
    expect(result.patterns.has('_comment')).toBe(false);
    expect(result.patterns.size).toBe(1);
  });

  it('собирает ошибку для нестрокового значения шаблона', () => {
    const result = parseCodePatterns({ samsung: 123 });
    expect(result.errors).toHaveLength(1);
    expect(result.patterns.size).toBe(0);
  });

  it('собирает ошибку для невалидного регулярного выражения', () => {
    const result = parseCodePatterns({ samsung: '[' });
    expect(result.errors).toHaveLength(1);
    expect(result.patterns.size).toBe(0);
  });
});

describe('validateModelCode', () => {
  const { patterns } = parseCodePatterns({ samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });

  it('подтверждает код, соответствующий шаблону', () => {
    expect(validateModelCode('samsung', 'SM-S928B', patterns)).toEqual({ valid: true });
  });

  it('отклоняет код, не соответствующий шаблону', () => {
    expect(validateModelCode('samsung', 'SM-G960?', patterns)).toEqual({ valid: false });
  });

  it('возвращает "no-pattern" для бренда без шаблона', () => {
    expect(validateModelCode('tecno', 'ANYTHING', patterns)).toEqual({ valid: 'no-pattern' });
  });
});

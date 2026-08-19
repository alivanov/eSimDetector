import { parseSubbrands, resolveSubbrandIdentity } from './subbrands';

describe('parseSubbrands', () => {
  it('разбирает соответствие подбрендов материнскому бренду', () => {
    const result = parseSubbrands({ poco: 'xiaomi', redmi: 'xiaomi' });
    expect(result.errors).toEqual([]);
    expect(result.subbrands.get('poco')).toBe('xiaomi');
    expect(result.subbrands.get('redmi')).toBe('xiaomi');
  });

  it('пропускает метаполя, начинающиеся с "_"', () => {
    const result = parseSubbrands({ _comment: 'пояснение', poco: 'xiaomi' });
    expect(result.subbrands.has('_comment')).toBe(false);
    expect(result.subbrands.size).toBe(1);
  });

  it('отклоняет значение, не являющееся объектом', () => {
    const result = parseSubbrands('строка');
    expect(result.subbrands.size).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('собирает ошибку для нестрокового значения родителя', () => {
    const result = parseSubbrands({ poco: 123 });
    expect(result.errors).toHaveLength(1);
    expect(result.subbrands.size).toBe(0);
  });

  it('собирает ошибку, если подбренд не входит в KNOWN_BRANDS', () => {
    const result = parseSubbrands({ 'not-a-brand': 'xiaomi' });
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('не входит в KNOWN_BRANDS')]),
    );
    expect(result.subbrands.size).toBe(0);
  });

  it('собирает ошибку, если материнский бренд не входит в KNOWN_BRANDS', () => {
    const result = parseSubbrands({ poco: 'not-a-brand' });
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('не входит в KNOWN_BRANDS')]),
    );
    expect(result.subbrands.size).toBe(0);
  });

  it('собирает ошибку, если подбренд совпадает с материнским брендом', () => {
    const result = parseSubbrands({ poco: 'poco' });
    expect(result.errors).toHaveLength(1);
    expect(result.subbrands.size).toBe(0);
  });
});

describe('resolveSubbrandIdentity', () => {
  const subbrands = parseSubbrands({ poco: 'xiaomi', redmi: 'xiaomi' }).subbrands;

  it('снимает собственный повтор бренда в названии (brand=poco, "POCO F3")', () => {
    const identity = resolveSubbrandIdentity('poco', 'POCO F3', subbrands);
    expect(identity).toEqual({ subbrand: 'poco', remainderText: 'F3', remainderKey: 'f3' });
  });

  it('без повтора остаток — исходное название целиком (brand=poco, "F3")', () => {
    const identity = resolveSubbrandIdentity('poco', 'F3', subbrands);
    expect(identity).toEqual({ subbrand: 'poco', remainderText: 'F3', remainderKey: 'f3' });
  });

  it('материнский бренд + название, начинающееся с подбренда (brand=xiaomi, "Redmi 9")', () => {
    const identity = resolveSubbrandIdentity('xiaomi', 'Redmi 9', subbrands);
    expect(identity).toEqual({ subbrand: 'redmi', remainderText: '9', remainderKey: '9' });
  });

  it('материнский бренд + название без упоминания подбренда — идентичность не определена', () => {
    expect(resolveSubbrandIdentity('xiaomi', 'Mi 11', subbrands)).toBeUndefined();
  });

  it('название состоит ровно из слова подбренда — остаток не может быть пустым, идентичность не определена', () => {
    expect(resolveSubbrandIdentity('xiaomi', 'Redmi', subbrands)).toBeUndefined();
  });

  it('бренд без известного соответствия подбрендов — идентичность не определена', () => {
    expect(resolveSubbrandIdentity('samsung', 'Galaxy S24', subbrands)).toBeUndefined();
  });

  it('сравнение первого слова регистронезависимо', () => {
    const identity = resolveSubbrandIdentity('xiaomi', 'redmi A2', subbrands);
    expect(identity).toEqual({ subbrand: 'redmi', remainderText: 'A2', remainderKey: 'a2' });
  });
});

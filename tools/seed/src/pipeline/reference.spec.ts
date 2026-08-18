import { applyReferenceCheck, compareToReference, parseReferenceFile } from './reference';

describe('parseReferenceFile', () => {
  it('разбирает корректный массив записей', () => {
    const result = parseReferenceFile([
      { id: 'samsung-galaxy-s24-ultra', esimSupport: 'yes' },
      { id: 'apple-iphone-x', esimSupport: 'no', note: 'до появления eSIM' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.get('samsung-galaxy-s24-ultra')?.esimSupport).toBe('yes');
      expect(result.value.get('apple-iphone-x')?.note).toBe('до появления eSIM');
    }
  });

  it('отклоняет запись с недопустимым esimSupport', () => {
    const result = parseReferenceFile([{ id: 'x', esimSupport: 'maybe' }]);
    expect(result.ok).toBe(false);
  });

  it('отклоняет значение, не являющееся массивом', () => {
    expect(parseReferenceFile({}).ok).toBe(false);
  });

  it('отклоняет элемент, не являющийся объектом', () => {
    const result = parseReferenceFile(['строка вместо объекта']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('ожидался объект');
    }
  });

  it('отклоняет запись с пустым или отсутствующим id', () => {
    expect(parseReferenceFile([{ id: '', esimSupport: 'yes' }]).ok).toBe(false);
    expect(parseReferenceFile([{ esimSupport: 'yes' }]).ok).toBe(false);
  });

  it('отклоняет запись с нестроковым note', () => {
    const result = parseReferenceFile([{ id: 'a', esimSupport: 'yes', note: 123 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('note');
    }
  });
});

describe('applyReferenceCheck', () => {
  it('без файла эталона пропускает все кандидаты без изменений', () => {
    const candidates = [{ id: 'a', esimSupport: 'yes' as const }];
    const result = applyReferenceCheck(candidates, undefined);
    expect(result).toEqual({ accepted: candidates, contradicting: [], matchedCount: 0, checkedCount: 0 });
  });

  it('пропускает кандидатов с esimSupport="unknown" без сверки (воздержание)', () => {
    const reference = new Map([['a', { id: 'a', esimSupport: 'no' as const }]]);
    const candidates = [{ id: 'a', esimSupport: 'unknown' as const }];
    const result = applyReferenceCheck(candidates, reference);
    expect(result.accepted).toEqual(candidates);
    expect(result.checkedCount).toBe(0);
  });

  it('пропускает кандидатов, отсутствующих в эталоне', () => {
    const reference = new Map([['a', { id: 'a', esimSupport: 'no' as const }]]);
    const candidates = [{ id: 'b', esimSupport: 'yes' as const }];
    const result = applyReferenceCheck(candidates, reference);
    expect(result.accepted).toEqual(candidates);
    expect(result.checkedCount).toBe(0);
  });

  it('принимает кандидата, согласного с эталоном, и считает совпадение', () => {
    const reference = new Map([['a', { id: 'a', esimSupport: 'yes' as const }]]);
    const candidates = [{ id: 'a', esimSupport: 'yes' as const }];
    const result = applyReferenceCheck(candidates, reference);
    expect(result.accepted).toEqual(candidates);
    expect(result.contradicting).toEqual([]);
    expect(result.matchedCount).toBe(1);
    expect(result.checkedCount).toBe(1);
  });

  it('отправляет в "contradicting" кандидата, противоречащего эталону', () => {
    const reference = new Map([['a', { id: 'a', esimSupport: 'no' as const }]]);
    const candidates = [{ id: 'a', esimSupport: 'yes' as const }];
    const result = applyReferenceCheck(candidates, reference);
    expect(result.accepted).toEqual([]);
    expect(result.contradicting).toEqual(candidates);
    expect(result.matchedCount).toBe(0);
    expect(result.checkedCount).toBe(1);
  });
});

describe('compareToReference', () => {
  it('без файла эталона возвращает skipped=true и не покрывает ничего', () => {
    const result = compareToReference(new Map([['a', 'yes']]), undefined);
    expect(result).toEqual({ skipped: true, intersectionSize: 0, mismatches: [], mismatchRate: 0 });
  });

  it('считает пересечение и расхождения по совпадающим id', () => {
    const reference = new Map([
      ['a', { id: 'a', esimSupport: 'yes' as const }],
      ['b', { id: 'b', esimSupport: 'no' as const }],
    ]);
    const devices = new Map<string, 'yes' | 'no' | 'conditional'>([
      ['a', 'yes'],
      ['b', 'yes'],
      ['c', 'no'],
    ]);
    const result = compareToReference(devices, reference);
    expect(result.skipped).toBe(false);
    expect(result.intersectionSize).toBe(2);
    expect(result.mismatches).toEqual([{ id: 'b', expected: 'no', actual: 'yes' }]);
    expect(result.mismatchRate).toBe(0.5);
  });
});

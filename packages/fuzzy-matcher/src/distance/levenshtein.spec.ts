import { damerauLevenshteinDistance, editSimilarity } from './levenshtein';

describe('damerauLevenshteinDistance', () => {
  it('известное значение: "kitten" → "sitting" за 3 правки', () => {
    expect(damerauLevenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('нулевое расстояние для идентичных строк', () => {
    expect(damerauLevenshteinDistance('iphone', 'iphone')).toBe(0);
    expect(damerauLevenshteinDistance('', '')).toBe(0);
  });

  it('поведение на пустой строке: расстояние равно длине непустой строки', () => {
    expect(damerauLevenshteinDistance('', 'abc')).toBe(3);
    expect(damerauLevenshteinDistance('abc', '')).toBe(3);
  });

  it('симметрична: расстояние не зависит от порядка аргументов', () => {
    expect(damerauLevenshteinDistance('samsung', 'самсунг')).toBe(
      damerauLevenshteinDistance('самсунг', 'samsung'),
    );
    expect(damerauLevenshteinDistance('xiomi', 'xiaomi')).toBe(
      damerauLevenshteinDistance('xiaomi', 'xiomi'),
    );
  });

  it('транспозиция двух соседних символов считается одной правкой (вариант OSA)', () => {
    expect(damerauLevenshteinDistance('ab', 'ba')).toBe(1);
    expect(damerauLevenshteinDistance('honro', 'honor')).toBe(1);
  });

  it('обычная замена, вставка и удаление по-прежнему стоят по одной правке каждая', () => {
    expect(damerauLevenshteinDistance('cat', 'bat')).toBe(1);
    expect(damerauLevenshteinDistance('cat', 'cats')).toBe(1);
    expect(damerauLevenshteinDistance('cats', 'cat')).toBe(1);
  });

  it(
    'ОПАСНОЕ СВОЙСТВО (AGENTS.md, предметное правило 2; docs/04 §4.2): смена цифры поколения ' +
      'даёт расстояние 1, как и обычная опечатка — поэтому цифра поколения не должна попадать ' +
      'в аргументы этой функции без отдельного точного сравнения выше по конвейеру (задача агента 2.4)',
    () => {
      expect(damerauLevenshteinDistance('iphone 12', 'iphone 13')).toBe(1);
      expect(damerauLevenshteinDistance('iphone 1', 'iphone 11')).toBe(1);
    },
  );
});

describe('editSimilarity', () => {
  it('единичная схожесть для идентичных строк, включая две пустые строки', () => {
    expect(editSimilarity('iphone', 'iphone')).toBe(1);
    expect(editSimilarity('', '')).toBe(1);
  });

  it('нулевая схожесть для полностью различающихся строк одинаковой длины', () => {
    expect(editSimilarity('a', 'b')).toBe(0);
  });

  it('поведение на пустой строке: схожесть падает пропорционально длине другой строки', () => {
    expect(editSimilarity('', 'abc')).toBe(0);
  });

  it('нормирована в диапазоне [0, 1] и убывает при росте расстояния', () => {
    const closeSimilarity = editSimilarity('galaxy', 'galaxi');
    const farSimilarity = editSimilarity('galaxy', 'redmi');

    expect(closeSimilarity).toBeGreaterThan(farSimilarity);
    expect(closeSimilarity).toBeLessThanOrEqual(1);
    expect(farSimilarity).toBeGreaterThanOrEqual(0);
  });
});

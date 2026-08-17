import { extractTrigrams, trigramSimilarity } from './trigrams';

describe('extractTrigrams', () => {
  it('дополняет строку краевыми заполнителями с обеих сторон', () => {
    expect(extractTrigrams('cat')).toEqual(['  c', ' ca', 'cat', 'at ', 't  ']);
  });

  it('приводит к нижнему регистру перед разбиением на триграммы', () => {
    expect(extractTrigrams('CAT')).toEqual(extractTrigrams('cat'));
  });

  it('поведение на пустой строке: заполнители всё равно дают триграммы', () => {
    expect(extractTrigrams('')).toEqual(['   ', '   ']);
  });

  it('короткая строка из одного символа даёт триграммы, покрывающие оба края', () => {
    expect(extractTrigrams('a')).toEqual(['  a', ' a ', 'a  ']);
  });
});

describe('trigramSimilarity', () => {
  it('единичная схожесть для идентичных строк, включая две пустые строки', () => {
    expect(trigramSimilarity('samsung', 'samsung')).toBe(1);
    expect(trigramSimilarity('', '')).toBe(1);
  });

  it('нулевая схожесть для строк без общих триграмм', () => {
    expect(trigramSimilarity('ab', 'xy')).toBe(0);
  });

  it('симметрична: схожесть не зависит от порядка аргументов', () => {
    expect(trigramSimilarity('galaxy', 'galaxi')).toBe(trigramSimilarity('galaxi', 'galaxy'));
  });

  it('коэффициент Жаккара: частично совпадающие строки дают значение строго между 0 и 1', () => {
    const similarity = trigramSimilarity('iphone', 'ipone');

    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it(
    'ОПАСНОЕ СВОЙСТВО (AGENTS.md, предметное правило 2; docs/04 §4.2): строки, отличающиеся ' +
      'только цифрой поколения, дают ВЫСОКУЮ триграммную схожесть — большая часть триграмм ' +
      'общая (8 из 14 различных триграмм двух строк, доля 0.57 — заметно выше нуля). Именно ' +
      'поэтому индекс триграмм (trigram/inverted-index.ts) строит ключ ТОЛЬКО из буквенной ' +
      'части устройства, без цифры поколения: иначе "iphone 12" и "iphone 13" были бы заметно ' +
      'похожи для этой меры, и агенту 2.4 просто не на чем было бы построить жёсткое ' +
      'ограничение на уровне отбора кандидатов',
    () => {
      const similarity = trigramSimilarity('iphone 12', 'iphone 13');

      expect(similarity).toBeCloseTo(0.5714, 3);
      expect(similarity).toBeGreaterThan(0.5);
    },
  );
});

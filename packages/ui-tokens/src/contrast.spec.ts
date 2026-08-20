import { contrastRatio, hexToRgb, meetsAaContrast, relativeLuminance } from './contrast';

describe('hexToRgb', () => {
  it('разбирает шестизначный hex-цвет', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#1a2b3c')).toEqual({ r: 26, g: 43, b: 60 });
  });

  it('возвращает undefined на форматах, отличных от #rrggbb', () => {
    expect(hexToRgb('не цвет')).toBeUndefined();
    expect(hexToRgb('#fff')).toBeUndefined();
    expect(hexToRgb('#gggggg')).toBeUndefined();
    expect(hexToRgb('000000')).toBeUndefined();
  });
});

describe('relativeLuminance', () => {
  it('чёрный даёт 0, белый — 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('чёрный на белом даёт максимальный контраст 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('одинаковые цвета дают контраст 1:1', () => {
    expect(contrastRatio('#ABABAB', '#ABABAB')).toBeCloseTo(1, 5);
  });

  it('не зависит от порядка аргументов (симметрична)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('возвращает undefined, если цвет переднего плана не разобрался', () => {
    expect(contrastRatio('не цвет', '#FFFFFF')).toBeUndefined();
  });

  it('возвращает undefined, если цвет фона не разобрался', () => {
    expect(contrastRatio('#000000', 'не цвет')).toBeUndefined();
  });
});

describe('meetsAaContrast', () => {
  it('undefined никогда не проходит проверку', () => {
    expect(meetsAaContrast(undefined)).toBe(false);
  });

  it('обычный текст требует не менее 4.5:1', () => {
    expect(meetsAaContrast(4.5)).toBe(true);
    expect(meetsAaContrast(4.49)).toBe(false);
  });

  it('крупный текст требует не менее 3:1', () => {
    expect(meetsAaContrast(3, true)).toBe(true);
    expect(meetsAaContrast(2.9, true)).toBe(false);
  });
});

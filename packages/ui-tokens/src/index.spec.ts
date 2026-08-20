import {
  contrastRatio,
  designTokens,
  flattenTokens,
  generateCssVariablesBlock,
  generateCssVariablesText,
  hexToRgb,
  meetsAaContrast,
  relativeLuminance,
} from './index';

describe('index — публичная поверхность пакета ui-tokens', () => {
  it('экспортирует объект токенов с шестью группами', () => {
    expect(Object.keys(designTokens).sort()).toEqual(
      ['colors', 'typography', 'spacing', 'shape', 'states', 'components'].sort(),
    );
  });

  it('экспортирует генерацию CSS-переменных', () => {
    expect(flattenTokens(designTokens).get('--esim-colors-primary')).toBe(
      designTokens.colors.primary,
    );
    expect(generateCssVariablesText(designTokens)).toContain('--esim-colors-primary');
    expect(generateCssVariablesBlock(designTokens)).toContain(':root {');
  });

  it('экспортирует расчёт контраста WCAG', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(meetsAaContrast(4.5)).toBe(true);
  });
});

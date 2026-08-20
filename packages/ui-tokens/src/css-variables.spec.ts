import {
  flattenTokens,
  generateCssVariablesBlock,
  generateCssVariablesText,
} from './css-variables';
import { designTokens } from './tokens';
import type { TokenGroup } from './types';

const sampleGroup: TokenGroup = {
  spacing: {
    xxl: '48px',
  },
  states: {
    loading: {
      spinnerDuration: '900ms',
    },
  },
};

describe('flattenTokens', () => {
  it('строит имена переменных в кебаб-регистре с префиксом --esim', () => {
    const flat = flattenTokens(sampleGroup);
    expect(flat.get('--esim-spacing-xxl')).toBe('48px');
    expect(flat.get('--esim-states-loading-spinner-duration')).toBe('900ms');
    expect(flat.size).toBe(2);
  });

  it('не трогает уже строчные сегменты без верблюжьего регистра', () => {
    const flat = flattenTokens({ shape: { radius: { full: '999px' } } });
    expect(flat.get('--esim-shape-radius-full')).toBe('999px');
  });

  it('на полном объекте токенов не роняет обход и покрывает вложенность компонентов', () => {
    const flat = flattenTokens(designTokens);
    expect(flat.get('--esim-colors-primary')).toBe('#25303b');
    expect(flat.get('--esim-colors-text-primary')).toBe('#1a2027');
    expect(flat.get('--esim-components-result-card-not-supported-background')).toBe('#eceef1');
  });
});

describe('generateCssVariablesText', () => {
  it('печатает по одному объявлению в строку с отступом в два пробела', () => {
    const text = generateCssVariablesText(designTokens);
    const lines = text.split('\n');
    expect(lines.every((line) => line.startsWith('  ') && line.endsWith(';'))).toBe(true);
    expect(text).toContain('--esim-colors-primary: #25303b;');
    expect(text).toContain('--esim-typography-font-size-md: 16px;');
  });
});

describe('generateCssVariablesBlock', () => {
  it('оборачивает объявления селектором :root по умолчанию', () => {
    const block = generateCssVariablesBlock(designTokens);
    expect(block.startsWith(':root {\n')).toBe(true);
    expect(block.endsWith('}\n')).toBe(true);
    expect(block).toContain('--esim-colors-primary: #25303b;');
  });

  it('принимает произвольный селектор — виджету нужен :host для теневого DOM', () => {
    const block = generateCssVariablesBlock(designTokens, ':host');
    expect(block.startsWith(':host {\n')).toBe(true);
  });
});

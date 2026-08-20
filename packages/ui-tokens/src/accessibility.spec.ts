import { contrastRatio, meetsAaContrast } from './contrast';
import { designTokens } from './tokens';

/**
 * Контрольные пары «текст на фоне», реально встречающиеся в компонентах токенов
 * (docs/13-branding.md §13.4 «контраст не ниже AA»). Это делает требование проверяемым тестом,
 * а не декларацией: сломай любое значение ниже — этот файл покажет, какая именно пара перестала
 * проходить AA.
 */
const AA_TEXT_ON_BACKGROUND_PAIRS: ReadonlyArray<{
  readonly name: string;
  readonly foreground: string;
  readonly background: string;
}> = [
  {
    name: 'основной текст на фоне страницы',
    foreground: designTokens.colors.text.primary,
    background: designTokens.colors.background,
  },
  {
    name: 'основной текст на поверхности (карточке)',
    foreground: designTokens.colors.text.primary,
    background: designTokens.colors.surface,
  },
  {
    name: 'вторичный текст на фоне страницы',
    foreground: designTokens.colors.text.secondary,
    background: designTokens.colors.background,
  },
  {
    name: 'вторичный текст на поверхности',
    foreground: designTokens.colors.text.secondary,
    background: designTokens.colors.surface,
  },
  {
    name: 'текст основной кнопки на её фоне',
    foreground: designTokens.components.button.primary.foreground,
    background: designTokens.components.button.primary.background,
  },
  {
    name: 'текст вторичной кнопки на её фоне',
    foreground: designTokens.components.button.secondary.foreground,
    background: designTokens.components.button.secondary.background,
  },
  {
    name: 'текстовая кнопка на поверхности страницы',
    foreground: designTokens.components.button.text.foreground,
    background: designTokens.colors.surface,
  },
  {
    name: 'карточка результата «поддерживает»',
    foreground: designTokens.components.resultCard.supported.foreground,
    background: designTokens.components.resultCard.supported.background,
  },
  {
    name: 'карточка результата «не поддерживает»',
    foreground: designTokens.components.resultCard.notSupported.foreground,
    background: designTokens.components.resultCard.notSupported.background,
  },
  {
    name: 'карточка результата «требуется уточнение»',
    foreground: designTokens.components.resultCard.clarification.foreground,
    background: designTokens.components.resultCard.clarification.background,
  },
  {
    name: 'подсказка в поле ввода на фоне поля',
    foreground: designTokens.components.input.hintColor,
    background: designTokens.components.input.background,
  },
];

describe('AA-контраст пар «текст на фоне» (docs/13-branding.md §13.4)', () => {
  it.each(AA_TEXT_ON_BACKGROUND_PAIRS)(
    '$name: контраст не ниже 4.5:1',
    ({ foreground, background }) => {
      const ratio = contrastRatio(foreground, background);
      expect(meetsAaContrast(ratio)).toBe(true);
    },
  );

  it('падает, если контраст пары ниже AA (проверка самого теста на нейтральной подмене)', () => {
    // Не значение из designTokens, а нарочно испорченная пара — фиксирует, что тест способен
    // обнаружить регресс контраста, а не всегда проходит независимо от входа.
    const lowContrastRatio = contrastRatio('#f4f6f8', '#f7f8fa');
    expect(meetsAaContrast(lowContrastRatio)).toBe(false);
  });
});

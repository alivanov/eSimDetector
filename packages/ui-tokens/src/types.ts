/**
 * Форма дерева токенов. Лист — строка (все значения приходят уже готовыми к CSS: `"#1a2027"`,
 * `"16px"`, `"1.5"`, `"0 4px 10px rgba(0,0,0,0.1)"`), узел — вложенная группа. Массивов и
 * примитивов кроме строки нет намеренно: `generateCssVariablesText` (`./css-variables.ts`) обходит
 * дерево одним универсальным алгоритмом без служебных случаев.
 */
export type TokenLeaf = string;

export interface TokenGroup {
  readonly [key: string]: TokenLeaf | TokenGroup;
}

export interface ColorStateTokens extends TokenGroup {
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly info: string;
}

export interface ColorTextTokens extends TokenGroup {
  readonly primary: string;
  readonly secondary: string;
  readonly inverse: string;
}

export interface ColorTokens extends TokenGroup {
  readonly primary: string;
  readonly secondary: string;
  readonly background: string;
  readonly surface: string;
  readonly text: ColorTextTokens;
  readonly border: string;
  readonly state: ColorStateTokens;
}

export interface TypographyFontSizeTokens extends TokenGroup {
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly xxl: string;
}

export interface TypographyLineHeightTokens extends TokenGroup {
  readonly tight: string;
  readonly normal: string;
  readonly relaxed: string;
}

export interface TypographyFontWeightTokens extends TokenGroup {
  readonly regular: string;
  readonly medium: string;
  readonly bold: string;
}

export interface TypographyHeadingTokens extends TokenGroup {
  /** Регистровые правила заголовков (docs/13-branding.md §13.2): без принудительного капса. */
  readonly textTransform: string;
  readonly letterSpacing: string;
}

export interface TypographyTokens extends TokenGroup {
  readonly fontFamily: string;
  readonly fontSize: TypographyFontSizeTokens;
  readonly lineHeight: TypographyLineHeightTokens;
  readonly fontWeight: TypographyFontWeightTokens;
  readonly heading: TypographyHeadingTokens;
}

export interface SpacingTokens extends TokenGroup {
  readonly xxs: string;
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly xxl: string;
}

export interface ShapeRadiusTokens extends TokenGroup {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly full: string;
}

export interface ShapeBorderWidthTokens extends TokenGroup {
  readonly thin: string;
  readonly regular: string;
  readonly thick: string;
}

export interface ShapeShadowTokens extends TokenGroup {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
}

export interface ShapeTokens extends TokenGroup {
  readonly radius: ShapeRadiusTokens;
  readonly borderWidth: ShapeBorderWidthTokens;
  readonly shadow: ShapeShadowTokens;
}

export interface FocusStateTokens extends TokenGroup {
  readonly outlineWidth: string;
  readonly outlineOffset: string;
  readonly outlineColor: string;
}

export interface OpacityStateTokens extends TokenGroup {
  readonly opacity: string;
}

export interface LoadingStateTokens extends TokenGroup {
  readonly opacity: string;
  readonly spinnerDuration: string;
}

export interface StatesTokens extends TokenGroup {
  readonly hover: OpacityStateTokens;
  readonly pressed: OpacityStateTokens;
  readonly focus: FocusStateTokens;
  readonly disabled: OpacityStateTokens;
  readonly loading: LoadingStateTokens;
}

export interface ButtonVariantTokens extends TokenGroup {
  readonly background: string;
  readonly foreground: string;
  readonly border: string;
  readonly radius: string;
}

export interface ButtonTokens extends TokenGroup {
  readonly primary: ButtonVariantTokens;
  readonly secondary: ButtonVariantTokens;
  readonly text: ButtonVariantTokens;
}

export interface InputTokens extends TokenGroup {
  readonly background: string;
  readonly border: string;
  readonly borderFocus: string;
  readonly hintColor: string;
  readonly errorBorder: string;
  readonly radius: string;
}

export interface ListItemTokens extends TokenGroup {
  readonly background: string;
  readonly hoverBackground: string;
  readonly selectedBackground: string;
  readonly foreground: string;
  readonly radius: string;
}

/**
 * Три состояния результата (docs/13-branding.md §13.2, последний абзац) — `notSupported`
 * СОЗНАТЕЛЬНО не использует `colors.state.error`: «не поддерживает» — корректный результат
 * определения, а не сбой приложения, и не должен визуально читаться как ошибка. Все три
 * варианта используют один и тот же нейтральный `text.primary` для текста, а не собственный
 * цветной текст — это гарантирует контраст AA без ручного подбора для каждого варианта в
 * отдельности и не даёт статусу выглядеть как сообщение об ошибке (шрифт остаётся нейтральным,
 * акцент несёт только рамка/иконка).
 */
export interface ResultCardVariantTokens extends TokenGroup {
  readonly background: string;
  readonly border: string;
  readonly foreground: string;
  readonly icon: string;
}

export interface ResultCardTokens extends TokenGroup {
  readonly supported: ResultCardVariantTokens;
  readonly notSupported: ResultCardVariantTokens;
  readonly clarification: ResultCardVariantTokens;
}

export interface LoadingIndicatorTokens extends TokenGroup {
  readonly color: string;
  readonly trackColor: string;
  readonly size: string;
  readonly duration: string;
}

export interface ComponentsTokens extends TokenGroup {
  readonly button: ButtonTokens;
  readonly input: InputTokens;
  readonly listItem: ListItemTokens;
  readonly resultCard: ResultCardTokens;
  readonly loadingIndicator: LoadingIndicatorTokens;
}

/** Ровно шесть групп по docs/13-branding.md §13.2. */
export interface DesignTokens extends TokenGroup {
  readonly colors: ColorTokens;
  readonly typography: TypographyTokens;
  readonly spacing: SpacingTokens;
  readonly shape: ShapeTokens;
  readonly states: StatesTokens;
  readonly components: ComponentsTokens;
}

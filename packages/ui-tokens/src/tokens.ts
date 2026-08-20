import type { DesignTokens } from './types';

/**
 * Слой токенов дизайна (docs/13-branding.md §13.2, ADR-012). Палитра НЕЙТРАЛЬНАЯ и намеренно не
 * привязана к бренду СберМобайл: доступа к брендбуку в Figma нет (ни сервера MCP, ни
 * `FIGMA_TOKEN` — docs/13 §13.3), а угадывать фирменные значения по памяти запрещено тем же
 * принципом, каким ADR-026 запрещает угадывать данные справочника по памяти языковой модели —
 * недостоверное значение хуже честного плейсхолдера. Замена на фирменное оформление — правка
 * значений в этом файле, без изменения разметки и логики компонентов (это и есть смысл ADR-012).
 *
 * Ровно шесть групп по таблице docs/13 §13.2: цвета, типографика, отступы, формы, состояния,
 * компоненты — форма проверена типом `DesignTokens` (`./types.ts`).
 *
 * `components.resultCard.notSupported` не использует `colors.state.error` и текст остаётся
 * нейтральным `colors.text.primary` во всех трёх вариантах — «не поддерживает» является таким же
 * корректным результатом определения, как и «поддерживает», а не сбоем приложения (docs/13 §13.2,
 * последний абзац; §13.4 «уточнение не выглядит ошибкой» — то же верно и для отказа).
 */
export const designTokens: DesignTokens = {
  colors: {
    primary: '#25303b',
    secondary: '#6b7785',
    background: '#f4f6f8',
    surface: '#ffffff',
    text: {
      primary: '#1a2027',
      secondary: '#4b5563',
      inverse: '#fbfcfd',
    },
    border: '#d8dce1',
    state: {
      success: '#1e8e5a',
      warning: '#b7791e',
      error: '#c53030',
      info: '#2b6cb0',
    },
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: {
      xs: '12px',
      sm: '14px',
      md: '16px',
      lg: '20px',
      xl: '24px',
      xxl: '32px',
    },
    lineHeight: {
      tight: '1.2',
      normal: '1.5',
      relaxed: '1.7',
    },
    fontWeight: {
      regular: '400',
      medium: '500',
      bold: '700',
    },
    heading: {
      // Регистровые правила заголовков (docs/13 §13.2): без принудительного капса —
      // навязанный текст-трансформ мешает экранным дикторам и не даёт очевидной пользы здесь.
      textTransform: 'none',
      letterSpacing: '0',
    },
  },
  spacing: {
    xxs: '4px',
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  shape: {
    radius: {
      sm: '4px',
      md: '8px',
      lg: '16px',
      full: '999px',
    },
    borderWidth: {
      thin: '1px',
      regular: '2px',
      thick: '4px',
    },
    shadow: {
      sm: '0 1px 2px rgba(15, 23, 32, 0.08)',
      md: '0 4px 10px rgba(15, 23, 32, 0.1)',
      lg: '0 10px 30px rgba(15, 23, 32, 0.12)',
    },
  },
  states: {
    hover: { opacity: '0.92' },
    pressed: { opacity: '0.85' },
    focus: {
      outlineWidth: '2px',
      outlineOffset: '1px',
      outlineColor: '#2b6cb0',
    },
    disabled: { opacity: '0.5' },
    loading: { opacity: '0.7', spinnerDuration: '900ms' },
  },
  components: {
    button: {
      primary: {
        background: '#25303b',
        foreground: '#fbfcfd',
        border: 'transparent',
        radius: '8px',
      },
      secondary: {
        background: '#ffffff',
        foreground: '#1a2027',
        border: '#d8dce1',
        radius: '8px',
      },
      text: {
        background: 'transparent',
        foreground: '#2b6cb0',
        border: 'transparent',
        radius: '4px',
      },
    },
    input: {
      background: '#ffffff',
      border: '#d8dce1',
      borderFocus: '#2b6cb0',
      hintColor: '#4b5563',
      errorBorder: '#c53030',
      radius: '8px',
    },
    listItem: {
      background: '#ffffff',
      hoverBackground: '#f4f6f8',
      selectedBackground: '#e8f1fa',
      foreground: '#1a2027',
      radius: '4px',
    },
    resultCard: {
      supported: {
        background: '#e6f4ec',
        border: '#1e8e5a',
        foreground: '#1a2027',
        icon: 'success',
      },
      notSupported: {
        background: '#eceef1',
        border: '#d8dce1',
        foreground: '#1a2027',
        icon: 'neutral',
      },
      clarification: {
        background: '#e8f1fa',
        border: '#2b6cb0',
        foreground: '#1a2027',
        icon: 'info',
      },
    },
    loadingIndicator: {
      color: '#2b6cb0',
      trackColor: '#d8dce1',
      size: '24px',
      duration: '900ms',
    },
  },
};

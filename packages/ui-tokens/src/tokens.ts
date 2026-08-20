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
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.25rem',
      xl: '1.5rem',
      xxl: '2rem',
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
    xxs: '0.25rem',
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  shape: {
    radius: {
      sm: '0.25rem',
      md: '0.5rem',
      lg: '1rem',
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
        radius: '0.5rem',
      },
      secondary: {
        background: '#ffffff',
        foreground: '#1a2027',
        border: '#d8dce1',
        radius: '0.5rem',
      },
      text: {
        background: 'transparent',
        foreground: '#2b6cb0',
        border: 'transparent',
        radius: '0.25rem',
      },
    },
    input: {
      background: '#ffffff',
      border: '#d8dce1',
      borderFocus: '#2b6cb0',
      hintColor: '#4b5563',
      errorBorder: '#c53030',
      radius: '0.5rem',
    },
    listItem: {
      background: '#ffffff',
      hoverBackground: '#f4f6f8',
      selectedBackground: '#e8f1fa',
      foreground: '#1a2027',
      radius: '0.25rem',
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
      size: '1.5rem',
      duration: '900ms',
    },
  },
};

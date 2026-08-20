import { resolveApiBase } from './resolve-api-base';

describe('resolveApiBase', () => {
  it('возвращает значение data-api-base, если оно указано', () => {
    expect(resolveApiBase('https://esim-detector.example.ru/api/v1')).toBe(
      'https://esim-detector.example.ru/api/v1',
    );
  });

  it('игнорирует пустую строку data-api-base и падает на переменную сборки', () => {
    expect(resolveApiBase('')).toBe('');
  });

  it('возвращает пустую строку, если data-api-base отсутствует и переменная сборки не задана', () => {
    // В тестовой среде `vite build`/`define` не выполняется — `__ESIM_WIDGET_API_BASE__` не
    // объявлена вовсе, что и проверяется здесь: код не бросает исключение при обращении.
    expect(resolveApiBase(null)).toBe('');
  });

  it('падает на переменную сборки, если она заменена (имитация `vite build`)', () => {
    Object.defineProperty(globalThis, '__ESIM_WIDGET_API_BASE__', {
      value: 'https://esim-detector.example.ru/api/v1',
      configurable: true,
    });
    try {
      expect(resolveApiBase(null)).toBe('https://esim-detector.example.ru/api/v1');
    } finally {
      Object.defineProperty(globalThis, '__ESIM_WIDGET_API_BASE__', {
        value: undefined,
        configurable: true,
      });
    }
  });
});

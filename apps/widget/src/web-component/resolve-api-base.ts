/**
 * `declare global` прямо в этом файле, а не в отдельном `global.d.ts`: отдельный файл без единого
 * импорта/экспорта, который никто явно не импортирует, попадает в программу TypeScript только
 * через `include` того `tsconfig.json`, который его физически перечисляет — а `apps/web`
 * подключает `@esim-detector/widget` через путь в `tsconfig.base.json` (ADR-039 п.4) и тянет
 * только файлы, реально достижимые по графу импортов от `src/index.ts`. Объявление внутри самого
 * `resolve-api-base.ts` едет вместе с файлом при любом способе подключения.
 */
declare global {
  // Заменяется буквальным значением на этапе `vite build` (`vite.config.ts`, `define`) из
  // переменной сборки `VITE_WIDGET_API_BASE` — тот же приём, что Vite использует для
  // `import.meta.env`, но без самого `import.meta`: последний недопустим при транспиляции в
  // CommonJS для тестов (`ts-jest`, `jest.config.ts` виджета переопределяет `module: 'commonjs'`).
  const __ESIM_WIDGET_API_BASE__: string;
}

/**
 * Адрес API берётся из `data-api-base` тега подключения; при его отсутствии — из переменной
 * сборки Vite `__ESIM_WIDGET_API_BASE__` (см. `declare global` выше, ADR-027 — «localhost в код
 * не прошивается»). Если ни того, ни другого нет, возвращается пустая строка: относительный путь
 * `/api/v1/...` на домене заказчика почти всегда не тот адрес, но пустая строка — явный, а не
 * скрытый выбор по умолчанию, и не бросает исключение (docs/07-integration.md §7.2). Обращение
 * через `typeof ... !== 'undefined'` не бросает исключение, даже если Vite ничего не заменил
 * (тесты, окружения без сборки) — идентификатор при этом действительно не существует в рантайме,
 * несмотря на объявленный выше тип `string`, и только `typeof` безопасен для такой проверки.
 */
export function resolveApiBase(explicitAttributeValue: string | null): string {
  if (explicitAttributeValue !== null && explicitAttributeValue.length > 0) {
    return explicitAttributeValue;
  }
  return typeof __ESIM_WIDGET_API_BASE__ !== 'undefined' ? __ESIM_WIDGET_API_BASE__ : '';
}

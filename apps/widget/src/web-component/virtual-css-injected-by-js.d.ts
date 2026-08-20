/**
 * Виртуальный модуль `vite-plugin-css-injected-by-js` (`vite.config.ts`) — не резолвится вне
 * `vite build`, поэтому у него нет собственного пакета типов, применимого без риска разойтись с
 * реальным API; интерфейс объявлен здесь буквально по документации пакета (README, версия 5,
 * раздел «Shadow DOM example»/«TypeScript support»). Файл без единого импорта/экспорта — то есть
 * "скриптовый" контекст, а не модуль: только в нём `declare module 'внешний-специфайер'` вводит
 * НОВЫЙ неглобальный модуль, а не augmentation уже существующего (внутри файла с собственными
 * `import`/`export`, как `esim-detector-widget-element.tsx`, та же конструкция ищет уже
 * существующий модуль и не находит его — ошибка TS2664). `apps/widget/jest.config.ts` подставляет
 * тестовый дублёр (`moduleNameMapper`) — сборка виджета не запускает Jest и наоборот.
 */
declare module 'virtual:css-injected-by-js' {
  export interface InjectCSSOptions {
    readonly target?: HTMLElement | ShadowRoot;
  }
  export function injectCSS(options?: InjectCSSOptions): void;
}

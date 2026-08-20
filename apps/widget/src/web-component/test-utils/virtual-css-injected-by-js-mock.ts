/**
 * Дублёр виртуального модуля `virtual:css-injected-by-js` (`vite-plugin-css-injected-by-js`) для
 * тестов — сам модуль существует только внутри `vite build` (`apps/widget/jest.config.ts`
 * подставляет этот файл через `moduleNameMapper`). CSS-инъекция реального содержимого не
 * проверяется тестами этого пакета (сборка — объём `pnpm build`, не `pnpm test`): достаточно,
 * что вызов не бросает исключение.
 */
export interface InjectCSSOptions {
  readonly target?: HTMLElement | ShadowRoot;
}

export function injectCSS(_options?: InjectCSSOptions): void {
  // Пусто намеренно.
}

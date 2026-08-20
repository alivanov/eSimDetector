import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

/**
 * Расширение `.mts`, а не `.ts` (в отличие от `apps/web/vite.config.ts`): `vite-plugin-css-
 * injected-by-js` — пакет только ESM, а `apps/widget/package.json` не объявляет `"type":
 * "module"` (как и остальные пакеты рабочего пространства, ADR-016 — `module: "CommonJS"` для
 * `tsc`-собираемых пакетов) — Vite загружал бы этот файл как CommonJS через `require`, что для
 * чисто ESM-зависимости заканчивается ошибкой `ERR_REQUIRE_ESM`. Расширение `.mts` заставляет
 * Vite загрузить сам конфигурационный файл как ESM независимо от `package.json`, не трогая тип
 * модуля всего пакета.
 *
 * Сборка виджета в один самодостаточный файл (docs/07-integration.md §7.2/§7.9, ADR-040):
 * формат IIFE, React бандлится внутрь (внешних зависимостей рантайма нет), путь результата
 * закрепляет версию — `widget/v1/esim-widget.js`. Это ВТОРАЯ точка сборки `apps/widget/src`:
 * первая (React-компонент `EsimChecker` для `apps/web` и уровня 2 интеграции, ADR-039)
 * компилируется напрямую бандлером-потребителем и не проходит через этот конфиг.
 */
export default defineConfig(({ mode }) => {
  // `loadEnv` — не `process.env` напрямую: Vite так же читает `.env`-файлы приложения, а не
  // только переменные, уже экспортированные в оболочке (ADR-027 — «localhost в код не прошивается»,
  // адрес API конфигурируется переменной сборки, а не хардкодится).
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      react(),
      // Без этого плагина Vite выносит CSS всех `*.module.css` компонентов (агент 6.2) в
      // отдельный файл `widget/v1/widget.css` — нарушение требования «один самодостаточный файл»
      // (docs/07 §7.2/§7.9): заказчику пришлось бы подключать вторую ссылку самому, а сам файл
      // при подключении обычным `<link>` был бы глобальным CSS страницы, а не изолированным в
      // теневом DOM. Виртуальный модуль `virtual:css-injected-by-js` (а не автоматический режим
      // по умолчанию) даёт явный контроль над МЕСТОМ инъекции — `esim-detector-widget-element.tsx`
      // вызывает `injectCSS({ target: shadowRoot })` сам, тем же приёмом, что и `injectDesignTokensStyle`.
      cssInjectedByJsPlugin(),
    ],
    define: {
      __ESIM_WIDGET_API_BASE__: JSON.stringify(env['VITE_WIDGET_API_BASE'] ?? ''),
      // В отличие от обычной сборки приложения (`apps/web`), Vite в режиме библиотеки НЕ
      // заменяет `process.env.NODE_ENV` автоматически (сознательное решение Vite — библиотека
      // может понадобиться потребителю с собственной сборкой, https://github.com/vitejs/vite/
      // issues/3229). React и его зависимости (`scheduler`) читают эту переменную напрямую, без
      // `typeof process`-проверки — без явной замены здесь браузер получает `ReferenceError:
      // process is not defined` при загрузке самодостаточного файла (обнаружено живым прогоном
      // страницы-примера, `pnpm typecheck`/`pnpm test` этого не показывают).
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: 'dist/widget/v1',
      emptyOutDir: true,
      lib: {
        entry: 'src/web-component/bootstrap.ts',
        formats: ['iife'],
        // Обязателен для IIFE (Vite), сам глобальный идентификатор не используется — точка входа
        // не экспортирует значений, только выполняет `bootstrap()` при загрузке скрипта.
        name: 'EsimDetectorWidget',
        fileName: () => 'esim-widget.js',
      },
    },
  };
});

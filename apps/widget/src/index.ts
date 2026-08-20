// Компоненты интерфейса eSIM Detector — единственный исходник для `apps/web` и Web Component
// (docs/07-integration.md, ADR-038, ADR-039, ADR-040).
export type { EsimCheckerProps, EsimCheckerResult } from './components/EsimChecker';
export { EsimChecker } from './components/EsimChecker';

export { injectDesignTokensStyle } from './styles/inject-tokens';

export * from './api';

// `./web-component` (уровень 1 интеграции, ADR-009/ADR-040) НЕ реэкспортируется здесь намеренно:
// это отдельная точка сборки (`vite.config.ts`, вход `web-component/bootstrap.ts`) со своим
// виртуальным модулем времени сборки (`virtual:css-injected-by-js`), непригодным для типизации
// внутри барреля, который `apps/web` подключает как обычный источник (ADR-039 п.4) — модуль,
// резолвящийся только внутри `vite build` виджета, не должен требовать разрешения в чужом
// `tsconfig.json`. Программный доступ к `registerEsimDetectorWidgetElement`/`ESIM_WIDGET_TAG_NAME`
// — прямой импорт из `@esim-detector/widget/src/web-component`, а не через этот барrel.

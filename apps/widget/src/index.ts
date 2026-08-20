// Компоненты интерфейса eSIM Detector — единственный исходник для `apps/web` и будущего Web
// Component (docs/07-integration.md, ADR-038, ADR-039).
export type { EsimCheckerProps, EsimCheckerResult } from './components/EsimChecker';
export { EsimChecker } from './components/EsimChecker';

export { injectDesignTokensStyle } from './styles/inject-tokens';

export * from './api';

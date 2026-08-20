/**
 * Объявление модулей `*.module.css` для сборки (Vite в `apps/web`/будущий бандл виджета,
 * этап 6.3) и для собственной проверки типов пакета (`pnpm --filter @esim-detector/widget run
 * typecheck`), которая не зависит от Vite намеренно: `apps/widget` — исходник компонентов, а не
 * bundler-приложение (ADR-038/ADR-039).
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

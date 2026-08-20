/**
 * Адреса поднятого контура (docs/07-integration.md §7.6) и страницы-примера виджета
 * (docs/08-testing-and-quality.md §8.3). Переопределяются переменными окружения — на случай,
 * если демонстрационный контур поднят на нестандартных портах (CI, параллельные прогоны).
 */
export const WEB_BASE_URL = process.env['E2E_WEB_BASE_URL'] ?? 'http://localhost:8080';
export const API_BASE_URL = process.env['E2E_API_BASE_URL'] ?? 'http://localhost:3000';
export const WIDGET_EXAMPLE_PORT = process.env['E2E_WIDGET_EXAMPLE_PORT'] ?? '4174';
export const WIDGET_EXAMPLE_URL = `http://localhost:${WIDGET_EXAMPLE_PORT}`;

import { defineConfig } from '@playwright/test';

import { WEB_BASE_URL, WIDGET_EXAMPLE_PORT } from './test/support/env';

/**
 * Конфигурация Playwright (docs/08-testing-and-quality.md §8.3, этап 6.5) — отдельный пакет
 * `apps/e2e`, отдельная команда `pnpm test:e2e` (не входит в корневой `pnpm test`, AGENTS.md:
 * тесты из чистого клона без Docker и без запущенной MongoDB — требование, которое e2e интерфейса
 * органически не может выполнить, поскольку ему нужен весь поднятый контур).
 *
 * Демонстрационный контур (`mongo`+`api`+`web`, `docker compose up -d`) — прерогатива вызывающего
 * (человека или CI), не этого конфига: `globalSetup` (`./test/support/global-setup.ts`) проверяет
 * его доступность и завершается понятной ошибкой на русском языке, если контур не поднят, вместо
 * непрозрачных таймаутов навигации в каждом тесте по отдельности.
 *
 * Страница-пример подключения виджета (docs/07-integration.md §7.2, `apps/widget/example/`)
 * ПОДНИМАЕТСЯ этим конфигом (`webServer` ниже) на отдельном порту — она под управлением этого
 * пакета (в отличие от `mongo`/`api`/`web`) и должна оставаться настоящим третьим источником
 * (не портом `apps/web`), иначе проверка кросс-доменной изоляции виджета перестала бы быть
 * настоящей кросс-доменной проверкой (докс/08 §8.3, последнее предложение).
 */
export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: './test/support/global-setup.ts',
  use: {
    baseURL: WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        'pnpm --filter @esim-detector/widget run build && pnpm --filter @esim-detector/widget run serve:example',
      url: `http://localhost:${WIDGET_EXAMPLE_PORT}`,
      env: { EXAMPLE_PORT: WIDGET_EXAMPLE_PORT },
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});

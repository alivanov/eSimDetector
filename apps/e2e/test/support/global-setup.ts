import { API_BASE_URL, WEB_BASE_URL } from './env';

/**
 * Быстрая проверка перед запуском набора (docs/08-testing-and-quality.md §8.3): e2e интерфейса
 * НЕ поднимает демонстрационный контур сам (`docker compose up -d` — объём пользователя/CI, а не
 * этого пакета, в отличие от статической страницы-примера виджета, управляемой `webServer` в
 * `playwright.config.ts`). Без этой проверки недоступный контур тонет в непонятных таймаутах
 * навигации в каждом тесте по отдельности — здесь сбой один, явный и на русском языке.
 */
export default async function globalSetup(): Promise<void> {
  const checks: readonly { readonly label: string; readonly url: string }[] = [
    { label: 'API', url: `${API_BASE_URL}/health/ready` },
    { label: 'веб-приложение', url: WEB_BASE_URL },
  ];

  const failures: string[] = [];
  for (const check of checks) {
    try {
      const response = await fetch(check.url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        failures.push(`${check.label} (${check.url}) ответил кодом ${String(response.status)}`);
      }
    } catch (error) {
      failures.push(
        `${check.label} (${check.url}) недоступен: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Демонстрационный контур не поднят или не готов — e2e-тесты интерфейса на нём и работают.',
        ...failures.map((failure) => `  - ${failure}`),
        'Поднимите контур перед запуском: docker compose up -d (docs/07-integration.md §7.6),',
        'дождитесь готовности (curl http://localhost:3000/health/ready) и повторите pnpm test:e2e.',
      ].join('\n'),
    );
  }
}

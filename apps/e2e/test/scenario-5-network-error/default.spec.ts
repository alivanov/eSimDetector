import { expect, test } from '@playwright/test';

import { interactionErrorTexts } from '../support/texts';

/**
 * Сценарий недоступного API (docs/08-testing-and-quality.md §8.8, docs/13-branding.md §13.6
 * «Ошибки взаимодействия»). `page.route(...).abort()` рвёт соединение на уровне сети браузера —
 * `fetch()` реального клиента (`apps/widget/src/api/http.ts`) отклоняется с `TypeError`, что
 * оборачивается в `ApiNetworkError` тем же кодом, что и настоящий обрыв связи, а не имитацией
 * ответа 5xx на уровне приложения. Устройство здесь не важно (сценарий проверяет обработку сбоя
 * взаимодействия, а не сигналы) — обычный десктопный профиль по умолчанию.
 */

test('сеть недоступна: понятный текст ошибки и повтор без бесконечной загрузки', async ({
  page,
}) => {
  let detectCallCount = 0;
  await page.route('**/api/v1/detect', async (route) => {
    detectCallCount += 1;
    if (detectCallCount === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/');

  const errorAlert = page.getByRole('alert');
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).toContainText(interactionErrorTexts.network);

  const retryButton = page.getByRole('button', { name: interactionErrorTexts.retry });
  await expect(retryButton).toBeVisible();

  await retryButton.click();

  // Второй запрос проходит (route.continue() без abort) — экран ошибки уходит без бесконечной
  // загрузки: либо результат, либо (реже, при недоступном контуре в этот момент) новая ошибка,
  // но не "вечный" индикатор загрузки — оба состояния взаимоисключающие с ролью `alert`.
  await expect(errorAlert).toBeHidden({ timeout: 15_000 });
  expect(detectCallCount).toBeGreaterThanOrEqual(2);
});

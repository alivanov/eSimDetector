import { devices, test } from '@playwright/test';

import { PIXEL_7 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectKeyboardAutoDetectFlow } from '../support/scenarios';

/**
 * Доступность (docs/08 §8.8, docs/13-branding.md §13.4): автоопределение до однозначного
 * результата, пройденное ТОЛЬКО с клавиатуры — без единого `.click()` мышью, с проверкой
 * `aria-live` и видимого индикатора фокуса. Не заменяет ручную проверку с экранным диктором
 * (docs/08 §8.8, контрольный список) — проверяет то, что формализуется автоматически.
 */
test.use({ ...devices[PIXEL_7.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${PIXEL_7.label}: автоопределение проходимо только с клавиатуры`, async ({ page }) => {
  await spoofMobileGpu(page, PIXEL_7.gpu);
  await expectKeyboardAutoDetectFlow(page);
});

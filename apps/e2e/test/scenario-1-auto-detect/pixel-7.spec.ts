import { devices, test } from '@playwright/test';

import { PIXEL_7 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectAutoDetectSupported } from '../support/scenarios';

/**
 * Сценарий 1 (docs/08-testing-and-quality.md §8.3): автоопределение с однозначным результатом.
 * `Pixel 7` определяется по устаревшему разбору User-Agent (`Sec-CH-UA-Model` в эмуляции Chromium
 * всегда пуст — `apps/api/src/modules/detection/android/resolve-android.ts`, реальный код разбора,
 * не подстава); `spoofMobileGpu` обязателен для мобильного профиля (см. докстринг `gpu-spoof.ts`).
 */
test.use({ ...devices[PIXEL_7.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${PIXEL_7.label}: однозначный статус "поддерживает" без уточнения`, async ({ page }) => {
  await spoofMobileGpu(page, PIXEL_7.gpu);
  await expectAutoDetectSupported(page);
});

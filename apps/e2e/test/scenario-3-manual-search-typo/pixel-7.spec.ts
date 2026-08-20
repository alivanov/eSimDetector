import { devices, test } from '@playwright/test';

import { PIXEL_7 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectManualSearchTypoFlow } from '../support/scenarios';

/**
 * Сценарий 3 (docs/08-testing-and-quality.md §8.3): ручной поиск с опечаткой на мобильном профиле
 * (доступное автодополнение `role="combobox"` в touch-viewport). Устройство не влияет на алгоритм
 * нормализации/сопоставления текста (он не зависит от сигналов браузера) — прогон на двух
 * профилях (см. соседний файл `desktop-chrome.spec.ts`) проверяет саму форму поиска, а не поиск.
 */
test.use({ ...devices[PIXEL_7.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${PIXEL_7.label}: поиск с опечаткой доводит до верного устройства`, async ({ page }) => {
  await spoofMobileGpu(page, PIXEL_7.gpu);
  await expectManualSearchTypoFlow(page);
});

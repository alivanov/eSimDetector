import { devices, test } from '@playwright/test';

import { PIXEL_2 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectAutoDetectNotSupported } from '../support/scenarios';

/** Сценарий 1 (docs/08 §8.3): второе устройство эмуляции — однозначный статус "не поддерживает". */
test.use({ ...devices[PIXEL_2.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${PIXEL_2.label}: однозначный статус "не поддерживает" без уточнения`, async ({ page }) => {
  await spoofMobileGpu(page, PIXEL_2.gpu);
  await expectAutoDetectNotSupported(page);
});

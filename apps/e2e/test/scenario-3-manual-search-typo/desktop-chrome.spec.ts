import { devices, test } from '@playwright/test';

import { DESKTOP_CHROME } from '../support/device-profiles';
import { expectManualSearchTypoFlow } from '../support/scenarios';

/** Сценарий 3 (docs/08 §8.3): та же форма поиска на настольном профиле — без подмены GPU (платформа `other` не проверяется на эмуляцию, docs/03 §3.8). */
test.use({ ...devices[DESKTOP_CHROME.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${DESKTOP_CHROME.label}: поиск с опечаткой доводит до верного устройства`, async ({
  page,
}) => {
  await expectManualSearchTypoFlow(page);
});

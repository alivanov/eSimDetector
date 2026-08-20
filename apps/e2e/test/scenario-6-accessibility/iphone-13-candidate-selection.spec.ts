import { devices, test } from '@playwright/test';

import { IPHONE_13 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectKeyboardCandidateFlow } from '../support/scenarios';

/** Доступность (docs/08 §8.8): выбор кандидата уточнения ТОЛЬКО с клавиатуры, с `aria-live` и видимым фокусом. */
test.use({ ...devices[IPHONE_13.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${IPHONE_13.label}: выбор кандидата уточнения проходим только с клавиатуры`, async ({
  page,
}) => {
  await spoofMobileGpu(page, IPHONE_13.gpu);
  await expectKeyboardCandidateFlow(page);
});

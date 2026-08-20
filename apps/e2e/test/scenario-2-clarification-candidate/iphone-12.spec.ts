import { devices, test } from '@playwright/test';

import { IPHONE_12 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectClarificationCandidateFlow } from '../support/scenarios';

/** Сценарий 2 (docs/08 §8.3): второе устройство эмуляции — тот же диалог, другая версия iOS. */
test.use({ ...devices[IPHONE_12.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${IPHONE_12.label}: выбор кандидата из списка доводит диалог до результата`, async ({
  page,
}) => {
  await spoofMobileGpu(page, IPHONE_12.gpu);
  await expectClarificationCandidateFlow(page);
});

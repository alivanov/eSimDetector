import { devices, test } from '@playwright/test';

import { IPHONE_13 } from '../support/device-profiles';
import { spoofMobileGpu } from '../support/gpu-spoof';
import { expectClarificationCandidateFlow } from '../support/scenarios';

/**
 * Сценарий 2 (docs/08-testing-and-quality.md §8.3): уточнение через выбор из списка кандидатов
 * (`clarification.kind === 'choose_candidate'`) с доведением до результата. Сигнатура экрана в
 * `screen_signatures` пуста в реальном развёртывании (`apps/api/src/modules/detection/ios/
 * screen-signature.service.ts`, найдено этим этапом) — правило по версии iOS одно не сужает
 * список кандидатов до согласия по статусу eSIM, поэтому автоопределение iPhone стабильно
 * приводит именно к `choose_candidate`, а не к прямому ответу.
 *
 * AGENTS.md, правило 3: на iOS определяется ГРУППА, а не модель — тест не проверяет точное
 * название модели в автоопределении, только `exactModelKnown: false`/наличие уточнения; точная
 * модель появляется лишь ПОСЛЕ явного выбора оператором одного из вариантов.
 */
test.use({ ...devices[IPHONE_13.playwrightDeviceName], defaultBrowserType: 'chromium' });

test(`${IPHONE_13.label}: выбор кандидата из списка доводит диалог до результата`, async ({
  page,
}) => {
  await spoofMobileGpu(page, IPHONE_13.gpu);
  await expectClarificationCandidateFlow(page);
});

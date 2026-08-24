import { expect, type Page } from '@playwright/test';

import { hasVisibleFocusIndicator, tabUntilFocused } from './keyboard';
import {
  checkScreenTexts,
  clarificationTexts,
  manualSearchTexts,
  presentationTexts,
} from './texts';

/**
 * Утверждения сценариев, общие для нескольких профилей устройств (docs/08-testing-and-quality.md
 * §8.3) — вынесены сюда, чтобы конкретные `*.spec.ts` файлы оставались тонкими обёртками
 * `test.use({...devices[...]})` + вызов сценария: `browserName`/`viewport`/`userAgent` — опции
 * уровня воркера в Playwright Test и не могут переопределяться внутри `test.describe()`
 * («Cannot use({ defaultBrowserType }) in a describe group» — так и обнаружено на практике этим
 * этапом), поэтому каждая пара «сценарий × устройство» — отдельный файл с `test.use()` на верхнем
 * уровне, а не общий цикл/`describe` по массиву профилей.
 */

/** Сценарий 1: автоопределение с однозначным статусом "поддерживает", без уточнения. */
export async function expectAutoDetectSupported(page: Page): Promise<void> {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: presentationTexts.supportedTitle })).toBeVisible();
  // Демо не передаёт `onPrimaryAction` — «Подключить eSIM» скрыта (план §3.2).
  await expect(page.getByRole('button', { name: presentationTexts.continueAction })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: presentationTexts.manualSearchAction }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: clarificationTexts.optionsGroupLabel })).toHaveCount(
    0,
  );
}

/** Сценарий 1: автоопределение с однозначным статусом "не поддерживает", без уточнения. */
export async function expectAutoDetectNotSupported(page: Page): Promise<void> {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: presentationTexts.notSupportedTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: presentationTexts.manualSearchAction }),
  ).toBeVisible();
  // `not_supported` не имеет `primaryAction` (docs/06 §6.2) — «Подключить eSIM» не показывается.
  await expect(page.getByRole('button', { name: presentationTexts.continueAction })).toHaveCount(0);
}

const CHOSEN_CANDIDATE_LABEL = 'Apple iPhone XS';

/**
 * Сценарий 2: `clarification.kind === 'choose_candidate'` → клик по варианту → доведённый до конца
 * результат (docs/08 §8.3). Конкретный вариант выбирается по ТЕКСТУ кнопки (ограничение промпта
 * этапа — `getByRole`, не индекс/структура разметки); `Apple iPhone XS` присутствует в списке
 * кандидатов на обоих профилях этого этапа. После выбора UI запрашивает `GET /devices/{id}`
 * (docs/06 §6.4) и показывает статус карточки — не повторный `/devices/search` по подписи
 * (поиск «Apple iPhone XS» даёт повторное уточнение XS vs XS Max из‑за `DECISION_GAP_TOO_SMALL`).
 */
export async function expectClarificationCandidateFlow(page: Page): Promise<void> {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: presentationTexts.clarificationTitle }),
  ).toBeVisible();

  const optionsGroup = page.getByRole('group', { name: clarificationTexts.optionsGroupLabel });
  await expect(optionsGroup).toBeVisible();
  const candidateButton = optionsGroup.getByRole('button', {
    name: CHOSEN_CANDIDATE_LABEL,
    exact: true,
  });
  await expect(candidateButton).toBeVisible();

  await candidateButton.click();

  await expect(page.getByRole('heading', { name: presentationTexts.supportedTitle })).toBeVisible();
  await expect(page.getByText(`${CHOSEN_CANDIDATE_LABEL} может использовать eSIM`)).toBeVisible();
  await expect(optionsGroup).toHaveCount(0);
}

const TYPO_QUERY = 'gooogle pixel 7a';
const TYPO_EXPECTED_DEVICE_NAME = 'Google Pixel 7a';

/**
 * Сценарий 3: ручной поиск с опечаткой доводит до верного устройства. `TYPO_QUERY` — буквальная
 * запись категории `typos` из `data/fixtures/queries.golden.json` (docs/08 §8.4:
 * `{"query": "gooogle pixel 7a", "expectedDeviceId": "google-pixel-7a"}`), даёт прямой `supported`
 * без промежуточного регионального уточнения (проверено запросом к `/api/v1/devices/search`).
 */
export async function expectManualSearchTypoFlow(page: Page): Promise<void> {
  await page.goto('/');

  // Дождаться завершения автоопределения: ссылка «Указать устройство вручную» видна уже на
  // экране загрузки, и ранний клик сбрасывается последующим `setScreen(result)` из `/detect`.
  await expect(
    page
      .getByRole('heading', {
        name: new RegExp(
          `${presentationTexts.supportedTitle}|${presentationTexts.notSupportedTitle}|${presentationTexts.clarificationTitle}`,
        ),
      })
      .first(),
  ).toBeVisible();

  // Переход к ручному поиску: либо единственная кнопка `manual_input` / нижняя ссылка
  // («Указать устройство вручную»), либо действие `manual_search` карточки («Это не моё
  // устройство»). Дубль ссылки при уже видимом переходе скрыт (план §3.1).
  const manualByName = page.getByRole('button', {
    name: checkScreenTexts.manualSearchLink,
    exact: true,
  });
  if ((await manualByName.count()) > 0) {
    await manualByName.click();
  } else {
    await page.getByRole('button', { name: presentationTexts.manualSearchAction }).click();
  }

  const field = page.getByLabel(manualSearchTexts.fieldLabel);
  await expect(field).toBeVisible();
  await field.fill(TYPO_QUERY);
  await page.getByRole('button', { name: manualSearchTexts.submit }).click();

  await expect(page.getByRole('heading', { name: presentationTexts.supportedTitle })).toBeVisible();
  await expect(
    page.getByText(`${TYPO_EXPECTED_DEVICE_NAME} может использовать eSIM`),
  ).toBeVisible();
}

/** Сценарий 6а: автоопределение → результат, пройденное только с клавиатуры, с проверкой aria-live/фокуса. */
export async function expectKeyboardAutoDetectFlow(page: Page): Promise<void> {
  await page.goto('/');

  const liveRegion = page.locator('[aria-live="polite"]');
  await expect(liveRegion).toHaveCount(1);

  await expect(page.getByRole('heading', { name: presentationTexts.supportedTitle })).toBeVisible();
  await expect(liveRegion).toContainText(presentationTexts.supportedTitle);

  // На демо нет «Подключить eSIM» — фокус клавиатуры на вторичном действии карточки.
  await tabUntilFocused(page, presentationTexts.manualSearchAction);
  expect(await hasVisibleFocusIndicator(page)).toBe(true);
}

/** Сценарий 6б: выбор кандидата уточнения только с клавиатуры, с проверкой aria-live/фокуса. */
export async function expectKeyboardCandidateFlow(page: Page): Promise<void> {
  await page.goto('/');

  const liveRegion = page.locator('[aria-live="polite"]');
  await expect(
    page.getByRole('heading', { name: presentationTexts.clarificationTitle }),
  ).toBeVisible();

  await tabUntilFocused(page, CHOSEN_CANDIDATE_LABEL);
  expect(await hasVisibleFocusIndicator(page)).toBe(true);

  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: presentationTexts.supportedTitle })).toBeVisible();
  await expect(liveRegion).toContainText(presentationTexts.supportedTitle);
  await expect(liveRegion).toContainText(`${CHOSEN_CANDIDATE_LABEL} может использовать eSIM`);
}

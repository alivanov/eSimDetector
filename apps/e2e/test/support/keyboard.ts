import type { Page } from '@playwright/test';

/**
 * Настоящая навигация Tab (не программный `.focus()` — иначе тест не доказывал бы прохождение
 * именно с клавиатуры, требование этапа) до элемента с заданным accessible name. Бросает исключение,
 * если элемент не найден за `maxPresses` — сценарий обязан быть проходим за конечное число нажатий,
 * бесконечный цикл был бы худшим отказом теста, чем явная ошибка.
 */
export async function tabUntilFocused(
  page: Page,
  accessibleName: string,
  maxPresses = 40,
): Promise<void> {
  for (let attempt = 0; attempt < maxPresses; attempt += 1) {
    const focusedName = await page.evaluate(() => {
      const active = document.activeElement;
      return active instanceof HTMLElement ? (active.textContent ?? '').trim() : '';
    });
    if (focusedName === accessibleName) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(
    `Не удалось достичь клавиатурой элемента "${accessibleName}" за ${String(maxPresses)} нажатий Tab`,
  );
}

/** `outline`/`box-shadow`, отличный от «нет» — минимальная проверка видимого фокуса (docs/13 §13.4). */
export async function hasVisibleFocusIndicator(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return false;
    }
    const style = getComputedStyle(active);
    const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
    const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
    return hasOutline || hasBoxShadow;
  });
}

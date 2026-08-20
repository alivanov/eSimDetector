import { expect, test } from '@playwright/test';

import { WIDGET_EXAMPLE_URL } from '../support/env';

/**
 * Виджет на СТОРОННЕЙ странице (docs/08-testing-and-quality.md §8.3, последнее предложение;
 * docs/07-integration.md §7.2). Страница-пример (`apps/widget/example/index.html`) поднята этим
 * же конфигом (`playwright.config.ts`, `webServer`) на порту, ОТДЕЛЬНОМ от `apps/web` (8080) и
 * `apps/api` (3000) — настоящая кросс-доменная проверка, а не /widget-example/ под тем же origin,
 * что демонстрационное приложение (там же проксируется `/api/`, а этот пример обращается к API
 * прямым абсолютным адресом `http://localhost:3000`, как заказчик на реальном чужом домене).
 *
 * `RED_TEXT_RGB`/`AGGRESSIVE_FONT` — буквально значения из инлайн-стиля `index.html`
 * (`color: #b00020 !important; font-family: 'Comic Sans MS', cursive !important;`, комментарий
 * в самом файле называет его «намеренно агрессивным»). Обычный десктопный профиль — сигналы
 * виджета не мобильные, `EMULATION_SUSPECTED` (docs/03 §3.8) на платформу `other` не действует
 * (`apps/api/src/modules/detection/emulation/detect-emulation.ts`), подмена WebGL не нужна.
 */

const RED_TEXT_RGB = 'rgb(176, 0, 32)';
const AGGRESSIVE_FONT = 'Comic Sans MS';

test('стили хост-страницы не проникают в виджет, а стили виджета не просачиваются наружу', async ({
  page,
}) => {
  await page.goto(WIDGET_EXAMPLE_URL);

  const hostParagraph = page.getByText('Этот абзац принадлежит странице заказчика');
  await expect(hostParagraph).toHaveCSS('color', RED_TEXT_RGB);
  await expect(hostParagraph).toHaveCSS('font-family', new RegExp(AGGRESSIVE_FONT));

  const widgetHeading = page.getByRole('heading', { name: 'Проверка поддержки eSIM' });
  await expect(widgetHeading).toBeVisible();
  await expect(widgetHeading).not.toHaveCSS('color', RED_TEXT_RGB);
  const widgetFont = await widgetHeading.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(widgetFont).not.toContain(AGGRESSIVE_FONT);

  // Обратное направление изоляции: стили виджета (CSS-модули компонентов) не видны host-документу.
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont).toContain(AGGRESSIVE_FONT);
});

/**
 * Отрицательный контроль этого теста (проверено этапом 6.5 фактически: временно поменяли
 * `composed: true` → `false` в `apps/widget/src/web-component/events.ts`, пересобрали виджет,
 * прогнали тест) дал ЧЕСТНЫЙ, но неожиданный результат — тест НЕ падает без `composed: true` на
 * этой странице-примере. Причина: `dispatchWidgetEvent` вызывается на самом `this` (хосте
 * теневого дерева, `esim-detector-widget-element.tsx`), а не на узле ВНУТРИ теневого дерева —
 * хост-элемент лежит в обычном светлом DOM страницы-примера (`bootstrap.ts` вставляет его
 * `target.appendChild(element)` в light DOM контейнера `data-target`), поэтому всплытие до
 * слушателя на контейнере ни разу не пересекает границу теневого DOM независимо от `composed`.
 * `composed: true` защищает от другого, не воспроизведённого здесь случая — если ЭТОТ контейнер
 * окажется вложен в ЕЩЁ ОДИН теневой DOM хоста (собственный веб-компонент заказчика), но это не
 * сценарий текущей страницы-примера и требует отдельной инфраструктуры для честной проверки.
 * Задокументировано как невыполненный критерий готовности этапа, а не молча обойдено.
 */
test('события жизненного цикла публикуются на контейнере данными нужной формы', async ({
  page,
}) => {
  await page.goto(WIDGET_EXAMPLE_URL);

  await expect(page.getByRole('heading', { name: 'Проверка поддержки eSIM' })).toBeVisible();

  // `esim:result` завершает автоопределение — событие публикуется после разрешения статуса
  // (клиентские сигналы этого профиля — desktop, реальный итог здесь не важен для теста форм).
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => (window as unknown as { __esimEvents?: { type: string }[] }).__esimEvents?.length,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  const events = await page.evaluate(
    () =>
      (window as unknown as { __esimEvents?: { type: string; detail: unknown }[] }).__esimEvents ??
      [],
  );

  const types = events.map((event) => event.type);
  expect(types).toContain('esim:ready');
  expect(types).toContain('esim:detected');
  expect(types).toContain('esim:result');

  const resultEvent = events.find((event) => event.type === 'esim:result');
  expect(resultEvent).toBeDefined();
  const detail = resultEvent?.detail as Record<string, unknown> | undefined;

  expect(detail).not.toBeUndefined();
  expect(['supported', 'not_supported', 'clarification_required']).toContain(detail?.['status']);
  expect('deviceId' in (detail ?? {})).toBe(true);
  expect(typeof detail?.['confidence']).toBe('number');
  expect(typeof detail?.['exactModelKnown']).toBe('boolean');
});

import {
  ESIM_WIDGET_TAG_NAME,
  registerEsimDetectorWidgetElement,
} from './esim-detector-widget-element';

const DATA_TARGET_ATTR = 'data-target';
const COPIED_ATTRS = ['data-api-base', 'data-theme', 'data-channel'] as const;

/**
 * Создаёт элемент виджета из конфигурации тега `<script>` (docs/07-integration.md §7.2) и
 * вставляет его в контейнер `data-target`. Принимает конкретный `<script>`, а не читает
 * `document.currentScript` сам — это делает функцию тестируемой без симуляции исполняющегося
 * скрипта (`document.currentScript` — доступный только на чтение геттер реального браузера,
 * который нельзя подменить в тестовой среде).
 *
 * Отсутствие `data-target` либо контейнера с таким селектором на странице — не исключение:
 * виджет просто не появляется, а не ломает остальную страницу заказчика.
 */
export function mountWidgetFromScriptTag(script: HTMLScriptElement): void {
  registerEsimDetectorWidgetElement();

  const targetSelector = script.getAttribute(DATA_TARGET_ATTR);
  if (targetSelector === null) {
    return;
  }
  const target = document.querySelector(targetSelector);
  if (target === null) {
    return;
  }

  const element = document.createElement(ESIM_WIDGET_TAG_NAME);
  for (const attr of COPIED_ATTRS) {
    const value = script.getAttribute(attr);
    if (value !== null) {
      element.setAttribute(attr, value);
    }
  }
  target.appendChild(element);
}

/**
 * Точка входа сборки `widget/v1/esim-widget.js`. `document.currentScript` действителен только
 * СИНХРОННО во время начального выполнения скрипта (в том числе для `defer`), поэтому он
 * читается на первой строке, до любой асинхронной операции.
 */
function bootstrap(): void {
  const currentScript = document.currentScript;
  if (currentScript instanceof HTMLScriptElement) {
    mountWidgetFromScriptTag(currentScript);
    return;
  }
  // Нет исполняющегося тега `<script>` (программное подключение модуля, тестовая среда) —
  // элемент всё равно регистрируется, чтобы вызывающий код мог создать и вставить его сам.
  registerEsimDetectorWidgetElement();
}

bootstrap();

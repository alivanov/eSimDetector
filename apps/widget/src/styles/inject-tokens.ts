import { designTokens, generateCssVariablesBlock } from '@esim-detector/ui-tokens';
import type { DesignTokens } from '@esim-detector/ui-tokens';

const STYLE_ELEMENT_SELECTOR = '#esim-detector-design-tokens';
const STYLE_ELEMENT_ID = 'esim-detector-design-tokens';

/**
 * Публикует CSS-переменные токенов (`--esim-*`, ADR-012) в переданный корень: `document` для
 * демонстрационного приложения (`:root`, нет теневого DOM) либо `ShadowRoot` для встраиваемого
 * виджета (этап 6.3, .cursor/rules/ui-and-widget.mdc — глобальный CSS в документ заказчика не
 * пишется). Функция уже готова к обоим случаям: 6.3 сможет вызвать её с `shadowRoot` без изменений
 * здесь — единственная разница обрабатывается ниже (вставка в `document.head` против самого корня).
 *
 * Идемпотентна: повторный вызов с тем же `root` не создаёт вторую копию стиля (проверяется
 * поиском уже вставленного элемента) — важно для React `StrictMode`, который в разработке
 * монтирует эффекты дважды.
 */
export function injectDesignTokensStyle(
  root: Document | ShadowRoot,
  tokens: DesignTokens = designTokens,
): void {
  if (root.querySelector(STYLE_ELEMENT_SELECTOR) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  const isDocument = root instanceof Document;
  style.textContent = generateCssVariablesBlock(tokens, isDocument ? ':root' : ':host');
  const mountPoint = isDocument ? root.head : root;
  mountPoint.appendChild(style);
}

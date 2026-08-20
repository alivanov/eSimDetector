import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { injectCSS } from 'virtual:css-injected-by-js';

import type { EsimCheckerResult } from '../components/EsimChecker';
import { EsimChecker } from '../components/EsimChecker';
import { injectDesignTokensStyle } from '../styles/inject-tokens';

import { dispatchWidgetEvent } from './events';
import { resolveApiBase } from './resolve-api-base';

export const ESIM_WIDGET_TAG_NAME = 'esim-detector-widget';

const DATA_API_BASE_ATTR = 'data-api-base';
const DATA_THEME_ATTR = 'data-theme';
const DATA_CHANNEL_ATTR = 'data-channel';
const MOUNT_POINT_ATTR = 'data-esim-widget-mount';

/**
 * Пользовательский элемент виджета (docs/07-integration.md §7.2, ADR-009, ADR-040) — вторая точка
 * выхода `apps/widget` рядом с React-компонентом `EsimChecker` (уровень 2 интеграции, не
 * переписывается). Разметка подключения (§7.2) не содержит этот тег напрямую — его создаёт
 * `bootstrap.ts` и вставляет в контейнер, указанный `data-target` тега `<script>`; сам элемент
 * читает свои собственные атрибуты, поэтому он тестируется в изоляции, без сценария подключения.
 *
 * Стили страницы заказчика и стили виджета взаимно изолированы теневым DOM (`.cursor/rules/
 * ui-and-widget.mdc`): переменные токенов вставляются функцией `injectDesignTokensStyle`
 * (`packages/ui-tokens`/`styles/inject-tokens.ts`, ADR-038/ADR-039) ВНУТРЬ `shadowRoot`, а не в
 * `document`, и это единственное место записи в теневой корень — компоненты `apps/widget/src`
 * не меняются ради этого этапа (объём промпта, п. 1).
 */
export class EsimDetectorWidgetElement extends HTMLElement {
  private root: Root | undefined;
  private observer: IntersectionObserver | undefined;
  private mounted = false;

  public get apiBaseAttribute(): string | null {
    return this.getAttribute(DATA_API_BASE_ATTR);
  }

  public get theme(): string | null {
    return this.getAttribute(DATA_THEME_ATTR);
  }

  public get channel(): string | null {
    return this.getAttribute(DATA_CHANNEL_ATTR);
  }

  public connectedCallback(): void {
    const shadowRoot = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    injectDesignTokensStyle(shadowRoot);
    // Стили CSS-модулей компонентов (`*.module.css`, агент 6.2), собранные в бандл
    // `vite-plugin-css-injected-by-js` (`vite.config.mts`) вместо отдельного файла `widget.css` —
    // цель `target` даёт им попасть в теневой корень этого экземпляра, а не в `document.head`.
    injectCSS({ target: shadowRoot });

    if (shadowRoot.querySelector(`[${MOUNT_POINT_ATTR}]`) === null) {
      const mountPoint = document.createElement('div');
      mountPoint.setAttribute(MOUNT_POINT_ATTR, '');
      shadowRoot.appendChild(mountPoint);
    }

    dispatchWidgetEvent(this, 'esim:ready', { channel: this.channel });

    // Автоопределение запускается при появлении виджета в области видимости (docs/07 §7.2), а не
    // при выполнении скрипта подключения — виджет ниже сгиба страницы не тратит сигналы/трафик,
    // пока пользователь до него не долистал. Окружения без `IntersectionObserver` (устаревшие
    // браузеры, тестовые среды) монтируются немедленно — это деградация, а не отказ виджета.
    if (typeof IntersectionObserver === 'undefined') {
      this.mountWidget();
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.mountWidget();
      }
    });
    this.observer.observe(this);
  }

  public disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.root?.unmount();
    this.root = undefined;
    this.mounted = false;
  }

  private mountWidget(): void {
    if (this.mounted) {
      return;
    }
    this.mounted = true;
    this.observer?.disconnect();
    this.observer = undefined;

    const mountPoint = this.shadowRoot?.querySelector(`[${MOUNT_POINT_ATTR}]`);
    if (!(mountPoint instanceof HTMLElement)) {
      return;
    }

    const apiBase = resolveApiBase(this.apiBaseAttribute);
    const channel = this.channel;
    let lastResult: EsimCheckerResult | undefined;

    this.root = createRoot(mountPoint);
    this.root.render(
      <EsimChecker
        apiBase={apiBase}
        {...(channel !== null ? { channel } : {})}
        locale="ru-RU"
        onDetected={(detection) => {
          dispatchWidgetEvent(this, 'esim:detected', {
            method: detection.method,
            platform: detection.platform,
            deviceType: detection.deviceType,
            exactModelKnown: detection.exactModelKnown,
          });
        }}
        onClarification={(clarification) => {
          dispatchWidgetEvent(this, 'esim:clarification', {
            kind: clarification.kind,
            question: clarification.question,
            options: clarification.options ?? [],
          });
        }}
        onResult={(result) => {
          lastResult = result;
          dispatchWidgetEvent(this, 'esim:result', result);
        }}
        onError={(error) => {
          dispatchWidgetEvent(this, 'esim:error', error);
        }}
        onPrimaryAction={(action) => {
          if (action.kind !== 'continue' || lastResult === undefined) {
            return;
          }
          dispatchWidgetEvent(this, 'esim:action', {
            kind: 'continue',
            label: action.label,
            deviceId: lastResult.deviceId,
            status: lastResult.status,
            confidence: lastResult.confidence,
          });
        }}
      />,
    );
  }
}

/** Идемпотентна: повторный вызов (несколько экземпляров скрипта на странице) не бросает исключение. */
export function registerEsimDetectorWidgetElement(): void {
  if (customElements.get(ESIM_WIDGET_TAG_NAME) === undefined) {
    customElements.define(ESIM_WIDGET_TAG_NAME, EsimDetectorWidgetElement);
  }
}

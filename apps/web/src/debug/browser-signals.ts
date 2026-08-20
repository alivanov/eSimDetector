import { collectSignals, createBrowserSignalsSource } from '@esim-detector/signals-collector';
import type { CollectedSignals } from '@esim-detector/signals-collector';

/**
 * Собирает сигналы РЕАЛЬНОГО браузера этого стенда для кнопки «Собрать сигналы этого браузера
 * заново» (docs/13-branding.md §13.6). Переиспользует единственный алгоритм сбора
 * (`packages/signals-collector`, ADR-038) напрямую, а не через `apps/widget/src/signals.ts`
 * (обёртка компонента `EsimChecker`, не переиспользуемая здесь намеренно — стенд не подключает
 * весь `EsimChecker`, только его источник сигналов).
 */
export function collectDebugBrowserSignals(): Promise<CollectedSignals> {
  return collectSignals(createBrowserSignalsSource(window));
}

export function stringifySignals(signals: unknown): string {
  return JSON.stringify(signals, null, 2);
}

export type JsonParseOutcome =
  { readonly kind: 'ok'; readonly value: unknown } | { readonly kind: 'error' };

/** Разбор текста поля «Сигналы в формате тела запроса /detect» — без утверждений `as` (ADR-016). */
export function parseSignalsInput(text: string): JsonParseOutcome {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'error' };
  }
  return { kind: 'ok', value };
}

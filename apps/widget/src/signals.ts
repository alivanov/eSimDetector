import type { CollectedSignals } from '@esim-detector/signals-collector';
import { collectSignals, createBrowserSignalsSource } from '@esim-detector/signals-collector';
import type { WindowLike } from '@esim-detector/signals-collector';

/**
 * Собирает сигналы реального браузера (ADR-038: `packages/signals-collector` — единственный
 * алгоритм сбора, `createBrowserSignalsSource` — единственный адаптер, знающий про canvas/WebGL).
 * `win` — параметр, а не обращение к глобальному `window` внутри самого модуля: тестам не нужен
 * настоящий браузер (docs/13-branding.md §13.4, ADR-016 — граница с внешней средой явная).
 */
export function collectBrowserSignals(win: WindowLike): Promise<CollectedSignals> {
  return collectSignals(createBrowserSignalsSource(win));
}

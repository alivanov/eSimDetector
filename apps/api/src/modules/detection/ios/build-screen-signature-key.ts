import type { ScreenSignals } from '../detection-signals';

/**
 * Строит ключ сигнатуры экрана `"<cssWidth>x<cssHeight>@<dpr>"` (docs/05-data-model.md, §5.5) —
 * тот же формат, что и поле `signature` коллекции `screen_signatures`. Геометрия приводится к
 * портретной ориентации (docs/03-detection-algorithm.md, §3.5, шаг 2: «приведение геометрии к
 * портретной ориентации») простым упорядочиванием меньшей и большей стороны — это устойчивее
 * поля `orientation` (его достоверность сама по себе не проверяется, а телефон в портретной
 * ориентации всегда имеет ширину не больше высоты).
 */
export function buildScreenSignatureKey(screen: ScreenSignals | undefined): string | undefined {
  if (screen?.width === undefined || screen.height === undefined || screen.dpr === undefined) {
    return undefined;
  }
  const width = Math.min(screen.width, screen.height);
  const height = Math.max(screen.width, screen.height);
  return `${width}x${height}@${formatDpr(screen.dpr)}`;
}

function formatDpr(dpr: number): string {
  if (Number.isInteger(dpr)) {
    return String(dpr);
  }
  return String(Math.round(dpr * 1000) / 1000);
}

/**
 * Разбор устаревшего формата User-Agent (docs/03-detection-algorithm.md, §3.4 п.1, §3.5 шаг 1):
 * версия iOS присутствует в User-Agent Safari и не подвергается редуцированию (в отличие от
 * Chrome/Android); модель Android в устаревшем формате всё ещё присутствует в некоторых
 * браузерах (Firefox для Android), когда UA-CH недоступны.
 */

/** `"CPU iPhone OS 18_5 like Mac OS X"` → `"18.5"`. Не редуцируется (docs/03 §3.5, шаг 1). */
export function parseIosVersionFromUserAgent(userAgent: string | undefined): string | undefined {
  if (userAgent === undefined) {
    return undefined;
  }
  const match = /CPU (?:iPhone )?OS (\d+)_(\d+)(?:_\d+)?/i.exec(userAgent);
  if (match === null) {
    return undefined;
  }
  const major = match[1];
  const minor = match[2];
  if (major === undefined || minor === undefined) {
    return undefined;
  }
  return `${major}.${minor}`;
}

/** `"Android 14.0.0"` → `"14.0.0"` — резерв, когда `uaData.platformVersion` недоступен. */
export function parseAndroidVersionFromUserAgent(
  userAgent: string | undefined,
): string | undefined {
  if (userAgent === undefined) {
    return undefined;
  }
  const match = /Android\s+([\d.]+)/i.exec(userAgent);
  return match?.[1];
}

/**
 * `"Mozilla/5.0 (Linux; Android 10; SM-G973F Build/QP1A.190711.020)"` → `"SM-G973F"`. Плейсхолдер
 * `K` (Chrome при доступных UA-CH) — не модель, трактуется как отсутствие данных (docs/03 §3.4 п.1).
 */
export function parseLegacyAndroidModelFromUserAgent(
  userAgent: string | undefined,
): string | undefined {
  if (userAgent === undefined) {
    return undefined;
  }
  const match = /Android\s+[\d.]+\s*;\s*([^;)]+?)\s*(?:Build\/[^)]*)?\)/i.exec(userAgent);
  const raw = match?.[1]?.trim();
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  if (raw.toUpperCase() === 'K') {
    return undefined;
  }
  return raw;
}

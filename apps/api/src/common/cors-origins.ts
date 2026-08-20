/**
 * Разбирает значение `CORS_ORIGINS` (docs/07-integration.md §7.8) в форму, принимаемую
 * `app.enableCors({ origin })` NestJS: `*` — отразить любой источник (демонстрационный режим
 * по умолчанию), непустой список через запятую — отражать только совпавший источник, пустая
 * строка — запретить все источники явно (а не молча трактовать пустоту как `*`).
 */
export function parseCorsOrigins(raw: string): boolean | readonly string[] {
  const trimmed = raw.trim();
  if (trimmed === '*') {
    return true;
  }
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

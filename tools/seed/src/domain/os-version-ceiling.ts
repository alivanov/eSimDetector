/**
 * Разбор `data/catalog/os-version-ceilings.json` — верхняя граница ФАКТИЧЕСКИ вышедшей версии
 * ОС на платформу, используемая проверкой `OS_VERSION_IMPLAUSIBLE` (docs/14-catalog-ingestion.md
 * §14.4 шаг 3): "модель, знающая об обещании производителя выпустить семь обновлений, складывает
 * его с версией на момент выпуска и записывает в `os_max_version` версию Android, которой ещё
 * не существует". Порог — данные, а не константа кода (.cursor/rules/pure-packages.mdc), потому
 * что требует периодического обновления по мере выхода новых версий ОС.
 */

export interface OsVersionCeilings {
  readonly android: number;
  readonly ios: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export type OsVersionCeilingsParseResult =
  | { readonly ok: true; readonly value: OsVersionCeilings }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseOsVersionCeilings(value: unknown): OsVersionCeilingsParseResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['os-version-ceilings.json: ожидался объект'] };
  }
  const { android, ios } = value;
  if (!isPositiveNumber(android) || !isPositiveNumber(ios)) {
    return {
      ok: false,
      errors: [
        'os-version-ceilings.json: поля "android" и "ios" обязаны быть положительными числами',
      ],
    };
  }
  return { ok: true, value: { android, ios } };
}

/** Первое число в строке версии (`"14.0"` → `14`, `"Android 14"` → `14`) — сравнивается с потолком. */
export function extractMajorVersion(rawVersion: string): number | undefined {
  const match = /\d+(?:\.\d+)?/.exec(rawVersion);
  if (match === null) {
    return undefined;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

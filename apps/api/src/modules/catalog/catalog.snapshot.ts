import { createHash } from 'node:crypto';

import type { CatalogOverride, Device } from '@esim-detector/contracts';
import { applyCatalogOverride } from '@esim-detector/contracts';
import type { MatcherDevice, MatchIndex } from '@esim-detector/fuzzy-matcher';
import { buildMatchIndex } from '@esim-detector/fuzzy-matcher';

/**
 * Метаданные справочника (docs/06-api-contract.md, §6.4: `GET /api/v1/catalog/meta` — «версия
 * справочника, число записей, дата обновления»). `version` не хранится отдельным полем базы —
 * агент 4/`tools/seed` пока не ведёт такую коллекцию (ADR-015 её не описывает буквально), поэтому
 * версия здесь ВЫЧИСЛЯЕТСЯ детерминированно из содержимого (см. `computeCatalogVersion`), а не
 * читается готовой. Как только появится коллекция версий импорта, `computeCatalogVersion`
 * заменяется на чтение поля — контракт `CatalogMeta` не изменится.
 */
export interface CatalogMeta {
  readonly version: string;
  readonly deviceCount: number;
  readonly updatedAt: string | null;
}

export interface CatalogSnapshot {
  /** ВСЕ записи (включая `status: deprecated`) — для точечных обращений по идентификатору. */
  readonly devices: ReadonlyMap<string, Device>;
  /**
   * Индексы нечёткого сопоставления (fuzzy-matcher, ADR-005) — построены ТОЛЬКО из записей
   * `status: active`: устаревшая запись не должна становиться результатом сопоставления
   * нового запроса, хотя и остаётся доступной по прямому идентификатору (`devices`).
   */
  readonly matchIndex: MatchIndex;
  readonly meta: CatalogMeta;
}

/**
 * Проекция записи справочника в структурный минимум, которым оперирует `fuzzy-matcher`
 * (docs/04-matching-algorithm.md, §4.6.1) — поля называются и типизируются идентично `Device`
 * (docs/05 §5.3), поэтому отображение — это выбор подмножества полей, а не преобразование значений.
 */
export function mapDeviceToMatcherDevice(device: Device): MatcherDevice {
  return {
    id: device._id,
    brand: device.brand,
    family: device.family,
    generation: device.generation,
    modifiers: device.modifiers,
    modelCodes: device.modelCodes,
    aliases: device.aliases,
    marketingName: device.marketingName,
    popularity: device.popularity,
  };
}

/**
 * Версия справочника — короткий детерминированный хеш от содержимого, значимого для ответов
 * (идентификаторы и `updatedAt` каждой записи): при неизменном справочнике версия не меняется
 * между перезапусками процесса, а любое изменение данных (включая наложение `catalog_overrides`)
 * меняет её. На пустом справочнике — тоже детерминированное, стабильное значение (docs/06 §6.4:
 * `GET /api/v1/catalog/meta` обязан отвечать 200 и на пустом справочнике).
 */
function computeCatalogVersion(devices: readonly Device[]): string {
  const fingerprint = devices
    .map((device) => `${device._id}:${device.updatedAt.toISOString()}`)
    .sort()
    .join('|');
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 12);
}

function computeUpdatedAt(devices: readonly Device[]): string | null {
  if (devices.length === 0) {
    return null;
  }
  const maxTimestamp = Math.max(...devices.map((device) => device.updatedAt.getTime()));
  return new Date(maxTimestamp).toISOString();
}

/**
 * Строит снимок справочника из записей `devices` и слоя решений модератора `catalog_overrides`
 * (docs/14-catalog-ingestion.md §14.4 шаг 6: приоритет 1, применяется последним, ПОСЛЕ чтения
 * из MongoDB и ПЕРЕД построением индексов сопоставления). Чистая функция без сети и файловой
 * системы — тестируется без базы данных; `CatalogService` вызывает её после чтения коллекций.
 */
export function buildCatalogSnapshot(
  devices: readonly Device[],
  overrides: readonly CatalogOverride[] = [],
): CatalogSnapshot {
  const overrideByDeviceId = new Map(overrides.map((override) => [override.deviceId, override]));
  const resolvedDevices = devices.map((device) =>
    applyCatalogOverride(device, overrideByDeviceId.get(device._id)),
  );

  const activeDevices = resolvedDevices.filter((device) => device.status === 'active');
  const matchIndex = buildMatchIndex(activeDevices.map(mapDeviceToMatcherDevice));

  return {
    devices: new Map(resolvedDevices.map((device) => [device._id, device])),
    matchIndex,
    meta: {
      version: computeCatalogVersion(resolvedDevices),
      deviceCount: resolvedDevices.length,
      updatedAt: computeUpdatedAt(resolvedDevices),
    },
  };
}

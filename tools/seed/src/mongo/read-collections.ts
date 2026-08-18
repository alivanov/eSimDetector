import type { CatalogOverride, Device } from '@esim-detector/contracts';
import { catalogOverrideSchema, deviceSchema } from '@esim-detector/contracts';
import type { Connection } from 'mongoose';

import { CATALOG_OVERRIDES_COLLECTION, DEVICES_COLLECTION } from './collections';

/**
 * Чтение коллекций рабочей базы для команд `verify`/`rebuild-signatures`/`export-overrides`
 * (docs/14-catalog-ingestion.md §14.5). Документ MongoDB — недоверенные внешние данные ровно в
 * том же смысле, что и CSV (ADR-016): проходит `deviceSchema.parse`/`catalogOverrideSchema.parse`
 * и только после этого получает тип предметной области — та же дисциплина, что и
 * `CatalogService.reload()` в `apps/api`.
 */
export async function readDevices(connection: Connection): Promise<readonly Device[]> {
  const rawDevices = await connection.collection(DEVICES_COLLECTION).find().toArray();
  return rawDevices.map((raw) => deviceSchema.parse(raw));
}

export async function readCatalogOverrides(
  connection: Connection,
): Promise<readonly CatalogOverride[]> {
  const rawOverrides = await connection.collection(CATALOG_OVERRIDES_COLLECTION).find().toArray();
  return rawOverrides.map((raw) => catalogOverrideSchema.parse(raw));
}

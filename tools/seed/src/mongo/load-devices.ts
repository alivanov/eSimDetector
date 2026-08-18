import type { Device } from '@esim-detector/contracts';
import type { Connection } from 'mongoose';

import { DEVICES_COLLECTION } from './collections';

export interface LoadDevicesStats {
  readonly upserted: number;
  readonly matched: number;
}

/**
 * Идемпотентная загрузка `devices` (docs/14-catalog-ingestion.md §14.5): обновление по
 * детерминированному `_id`, `catalog_overrides` не трогается вообще (слой решений модератора
 * применяется на чтении — `CatalogModule`/`applyCatalogOverride`, агент 3 — а не здесь). Повторный
 * запуск с тем же входом не создаёт дубликатов (`_id` уникален по построению upsert) и не
 * меняет `createdAt` уже существующих записей (`$setOnInsert`), только `updatedAt`.
 *
 * Запись напрямую через нативный драйвер (`connection.collection`), а не через Mongoose-модель
 * `apps/api`: документ уже провалидирован `deviceSchema.parse` до вызова этой функции (ADR-016),
 * повторная валидация Mongoose-схемой ничего не добавляет, а связывать `tools/seed` с `apps/api`
 * ради одной схемы — лишняя зависимость инструмента от приложения.
 */
export async function loadDevices(
  connection: Connection,
  devices: readonly Device[],
): Promise<LoadDevicesStats> {
  if (devices.length === 0) {
    return { upserted: 0, matched: 0 };
  }

  const collection = connection.collection<Device>(DEVICES_COLLECTION);
  const operations = devices.map((device) => {
    const { _id, createdAt, ...rest } = device;
    return {
      updateOne: {
        filter: { _id },
        update: {
          $set: rest,
          $setOnInsert: { createdAt },
        },
        upsert: true,
      },
    };
  });

  const result = await collection.bulkWrite(operations);
  return { upserted: result.upsertedCount, matched: result.matchedCount };
}

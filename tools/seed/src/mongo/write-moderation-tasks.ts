import type { Connection } from 'mongoose';

import type { SourceDisagreementReportEntry } from '../pipeline/build-catalog';
import type { QuarantineEntry } from '../domain/types';

const MODERATION_TASKS_COLLECTION = 'moderation_tasks';

interface UpsertTaskInput {
  readonly kind: string;
  readonly key: string;
  readonly payload: unknown;
}

/**
 * Пишет задачи модерации `csv_quarantine`/`source_disagreement` (docs/15-moderation.md §15.2)
 * напрямую в `moderation_tasks` — через нативный драйвер, как и остальные записи `tools/seed`
 * (`load-devices.ts`, `load-signatures.ts`), а не через Mongoose-модель `apps/api`
 * (`ModerationTaskService`): у инструмента нет зависимости от приложения. Семантика upsert
 * (дедупликация со счётчиком обращений) буквально повторяет
 * `ModerationTaskService.upsert` (`apps/api/src/modules/moderation/moderation-task.service.ts`) —
 * ОДИН формат документа для задачи, независимо от того, кто её создал: API при живом запросе
 * или `tools/seed` при импорте. Повторный `pnpm seed load` с теми же данными увеличивает
 * `occurrences` существующих задач, а не создаёт дубликаты (тот же ключ `kind`+`key`).
 */
async function upsertTask(connection: Connection, input: UpsertTaskInput): Promise<void> {
  const collection = connection.collection(MODERATION_TASKS_COLLECTION);
  const now = new Date();
  await collection.updateOne(
    { kind: input.kind, key: input.key },
    {
      $set: { payload: input.payload, lastSeenAt: now, updatedAt: now },
      $inc: { occurrences: 1 },
      $setOnInsert: {
        kind: input.kind,
        key: input.key,
        status: 'open',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function writeCsvQuarantineTasks(
  connection: Connection,
  entries: readonly QuarantineEntry[],
): Promise<number> {
  for (const entry of entries) {
    await upsertTask(connection, {
      kind: 'csv_quarantine',
      key: `${entry.code}:${entry.source}:${entry.batchId}:${entry.lineNumber}`,
      payload: {
        code: entry.code,
        source: entry.source,
        batchId: entry.batchId,
        lineNumber: entry.lineNumber,
        detail: entry.detail,
        ...(entry.rawBrand !== undefined ? { rawBrand: entry.rawBrand } : {}),
        ...(entry.rawMarketingName !== undefined
          ? { rawMarketingName: entry.rawMarketingName }
          : {}),
      },
    });
  }
  return entries.length;
}

export async function writeSourceDisagreementTasks(
  connection: Connection,
  entries: readonly SourceDisagreementReportEntry[],
): Promise<number> {
  for (const entry of entries) {
    await upsertTask(connection, {
      kind: 'source_disagreement',
      key: entry.deviceId,
      payload: { deviceId: entry.deviceId, variants: entry.variants },
    });
  }
  return entries.length;
}

import { applyCatalogOverride } from '@esim-detector/contracts';

import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { loadScreenSignatures } from '../mongo/load-signatures';
import { readCatalogOverrides, readDevices } from '../mongo/read-collections';
import { rebuildScreenSignatures } from '../pipeline/rebuild-signatures';

export interface RebuildSignaturesOptions {
  readonly mongoUri: string;
}

/**
 * `pnpm seed rebuild-signatures` (docs/05-data-model.md §5.5) — читает `devices` из MongoDB
 * (уже загруженные `load`), пересобирает `screen_signatures` целиком (коллекция производная,
 * решений модератора в ней нет — безопасно заменяется полностью).
 *
 * **Учёт `catalog_overrides` (этап 7, docs/09-decisions.md, ADR по пункту 8 передачи агента
 * 6.6/431bd8d).** Решение модератора «привязать сигнатуру к устройству» (docs/15-moderation.md
 * §15.4) добавляет геометрию в `catalog_overrides.patch.screenSignatures` — слой, применяемый
 * ПОСЛЕДНИМ при слиянии (docs/14 §14.4 шаг 6). Без применения overrides ЗДЕСЬ полная пересборка
 * после массового `pnpm seed load` бы читала «сырые» `devices` и стирала решения модератора о
 * привязке сигнатур из производной коллекции — тот самый риск, от которого ADR-014 защищает
 * `catalog_overrides` в целом. `applyCatalogOverride` — та же чистая функция
 * `@esim-detector/contracts`, что использует `CatalogService.reload()` в `apps/api`, поэтому
 * пересобранная коллекция остаётся согласованной с тем, что вернёт `POST /api/v1/detect`.
 */
export async function runRebuildSignaturesCommand(
  options: RebuildSignaturesOptions,
): Promise<number> {
  const connection = await connectToMongo(options.mongoUri);
  try {
    const [rawDevices, overrides] = await Promise.all([
      readDevices(connection),
      readCatalogOverrides(connection),
    ]);
    const overrideByDeviceId = new Map(overrides.map((override) => [override.deviceId, override]));
    const devices = rawDevices.map((device) =>
      applyCatalogOverride(device, overrideByDeviceId.get(device._id)),
    );

    const now = new Date();
    const records = rebuildScreenSignatures(devices, now);
    const inserted = await loadScreenSignatures(connection, records);
    process.stdout.write(`Пересобрано сигнатур экрана: ${inserted}\n`);
    return 0;
  } finally {
    await disconnectFromMongo(connection);
  }
}

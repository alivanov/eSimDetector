import { DEFAULT_CURATED_DIR, DEFAULT_OVERRIDES_DIR } from '../defaults';
import { writeJson } from '../io/files';
import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { readCatalogOverrides, readDevices } from '../mongo/read-collections';

export interface ExportOverridesOptions {
  readonly mongoUri: string;
  readonly overridesDir?: string;
  readonly curatedDir?: string;
}

/**
 * Идентификатор устройства, созданного модератором целиком через `POST /api/v1/admin/devices`
 * (docs/15-moderation.md §15.4, `apps/api/src/modules/moderation/build-device-from-dto.ts`) —
 * отличается от импортированных/курируемых записей префиксом `provenance.source`.
 */
function isModeratorCreatedDevice(source: string): boolean {
  return source.startsWith('moderator:');
}

/**
 * `pnpm seed export-overrides` (docs/14-catalog-ingestion.md §14.5) — выгружает решения
 * модератора в файлы каталога для pull request (ADR-014, ADR-006: «источник истины —
 * версионируемые файлы в `data/catalog/`»), двумя способами по типу решения:
 *
 * 1. **Патчи над существующими записями** (`catalog_overrides`) → `data/catalog/overrides/<deviceId>.json` —
 *    как и раньше, без изменений этим этапом.
 * 2. **Устройства, созданные модератором целиком** (этап 7, docs/15 §15.4: «Создать запись
 *    устройства») → `data/catalog/curated/moderator-<deviceId>.json`. Такой файл лежит В ТОМ ЖЕ
 *    каталоге, что и вендорское курируемое ядро, и подхватывается СУЩЕСТВУЮЩИМ кодом конвейера
 *    (`discoverJsonFiles(paths.curatedDir)`, `tools/seed/src/pipeline/pipeline-runner.ts`) без
 *    единой правки `pipeline/*`: на следующем `pnpm seed load` (в том числе на свежем чистом
 *    клоне, где сама база ещё не создавалась) запись гарантированно попадёт в справочник —
 *    ровно то же свойство, которое ADR-006 требует от решений куратора-человека. `provenance.source`
 *    у такой записи остаётся `moderator:<логин>` (а не переписывается в `curated`) — это другой,
 *    честно отличимый источник данных, а не вендорская сверка.
 *
 * Источник истины остаётся в MongoDB до экспорта — эта команда лишь делает решения обозримыми в
 * ревью; сам факт экспорта не меняет поведение уже запущенного контура (для этого — `POST
 * /api/v1/admin/catalog/reload`, docs/09-decisions.md, ADR по пункту 8 передачи).
 */
export async function runExportOverridesCommand(options: ExportOverridesOptions): Promise<number> {
  const connection = await connectToMongo(options.mongoUri);
  const overridesDir = options.overridesDir ?? DEFAULT_OVERRIDES_DIR;
  const curatedDir = options.curatedDir ?? DEFAULT_CURATED_DIR;
  try {
    const [overrides, devices] = await Promise.all([
      readCatalogOverrides(connection),
      readDevices(connection),
    ]);
    for (const override of overrides) {
      writeJson(`${overridesDir}/${override.deviceId}.json`, override);
    }

    const moderatorDevices = devices.filter((device) =>
      isModeratorCreatedDevice(device.provenance.source),
    );
    for (const device of moderatorDevices) {
      writeJson(`${curatedDir}/moderator-${device._id}.json`, device);
    }

    process.stdout.write(
      `Выгружено решений модератора: ${overrides.length} патчей, ${moderatorDevices.length} новых устройств\n`,
    );
    return 0;
  } finally {
    await disconnectFromMongo(connection);
  }
}

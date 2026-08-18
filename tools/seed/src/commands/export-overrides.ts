import { DEFAULT_OVERRIDES_DIR } from '../defaults';
import { writeJson } from '../io/files';
import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { readCatalogOverrides } from '../mongo/read-collections';

export interface ExportOverridesOptions {
  readonly mongoUri: string;
  readonly overridesDir?: string;
}

/**
 * `pnpm seed export-overrides` (docs/14-catalog-ingestion.md §14.5) — выгружает решения
 * модератора (`catalog_overrides`) в файлы `data/catalog/overrides/<deviceId>.json` для pull
 * request (ADR-014: "экспорт решений в файлы каталога для pull request"). Источник истины
 * остаётся в MongoDB до экспорта — эта команда лишь делает решения обозримыми в ревью.
 */
export async function runExportOverridesCommand(options: ExportOverridesOptions): Promise<number> {
  const connection = await connectToMongo(options.mongoUri);
  const overridesDir = options.overridesDir ?? DEFAULT_OVERRIDES_DIR;
  try {
    const overrides = await readCatalogOverrides(connection);
    for (const override of overrides) {
      writeJson(`${overridesDir}/${override.deviceId}.json`, override);
    }
    process.stdout.write(`Выгружено решений модератора: ${overrides.length}\n`);
    return 0;
  } finally {
    await disconnectFromMongo(connection);
  }
}

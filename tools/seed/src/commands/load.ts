import { DEFAULT_REPORTS_DIR, DEFAULT_SNAPSHOT_PATH } from '../defaults';
import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { loadDevices } from '../mongo/load-devices';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runAndBuildReport } from './shared';
import { writeReportFiles, writeSnapshot } from './report-helpers';

export interface LoadCommandOptions {
  readonly dryRun: boolean;
  readonly mongoUri: string;
  readonly reportsDir?: string;
  readonly snapshotPath?: string;
  readonly paths?: PipelinePaths;
}

/**
 * `pnpm seed load [--dry-run]` (docs/14-catalog-ingestion.md §14.5) — полный конвейер (шаги 1–7)
 * по ВСЕМ источникам `data/catalog/import/` и, если не `--dry-run`, идемпотентная загрузка
 * принятых записей в `devices` (`catalog_overrides` не трогается — ADR-014/docs/14 §14.5).
 * Отказывается писать в базу, если `validateCatalogInvariants` (запускается ДО загрузки, а не
 * только после — AGENTS.md, критерий готовности) нашёл нарушения §5.8.
 */
export async function runLoadCommand(options: LoadCommandOptions): Promise<number> {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
  const reportsDir = options.reportsDir ?? DEFAULT_REPORTS_DIR;
  const { result, report, markdown } = runAndBuildReport({
    snapshotPath,
    ...(options.paths !== undefined ? { paths: options.paths } : {}),
  });

  process.stdout.write(`${markdown}\n`);
  writeReportFiles(reportsDir, new Date(report.generatedAt), markdown, report);

  if (result.invariantViolations.length > 0) {
    process.stderr.write(
      `Загрузка отменена: найдено ${result.invariantViolations.length} нарушений инвариантов §5.8 ` +
        `до записи в MongoDB (docs/05-data-model.md §5.8):\n`,
    );
    for (const violation of result.invariantViolations) {
      process.stderr.write(`  [${violation.code}] ${violation.message}\n`);
    }
    return 1;
  }

  if (options.dryRun) {
    process.stdout.write(
      `--dry-run: запись в MongoDB пропущена (готово к загрузке: ${result.devices.length} устройств)\n`,
    );
    return 0;
  }

  const connection = await connectToMongo(options.mongoUri);
  try {
    const stats = await loadDevices(connection, result.devices);
    process.stdout.write(
      `Загружено в MongoDB: ${stats.upserted} новых, ${stats.matched} обновлено (всего ${result.devices.length})\n`,
    );
  } finally {
    await disconnectFromMongo(connection);
  }

  writeSnapshot(snapshotPath, result.devices);
  return 0;
}

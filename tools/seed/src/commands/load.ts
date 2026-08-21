import {
  DEFAULT_INVARIANT_QUARANTINE_RATIO_THRESHOLD,
  DEFAULT_REPORTS_DIR,
  DEFAULT_SNAPSHOT_PATH,
} from '../defaults';
import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { loadDevices } from '../mongo/load-devices';
import {
  writeCsvQuarantineTasks,
  writeSourceDisagreementTasks,
} from '../mongo/write-moderation-tasks';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runAndBuildReport } from './shared';
import { writeReportFiles, writeSnapshot } from './report-helpers';

export interface LoadCommandOptions {
  readonly dryRun: boolean;
  readonly mongoUri: string;
  readonly reportsDir?: string;
  readonly snapshotPath?: string;
  readonly paths?: PipelinePaths;
  /**
   * Доля устройств, карантинированных за нарушение инвариантов §5.8 относительно всех, прошедших
   * консенсус, выше которой загрузка отказывает целиком (docs/09-decisions.md ADR-029) — параметр
   * импорта (соответствует `--max-quarantine-ratio` CLI), а не константа кода. По умолчанию —
   * `DEFAULT_INVARIANT_QUARANTINE_RATIO_THRESHOLD`.
   */
  readonly invariantQuarantineRatioThreshold?: number;
}

/**
 * `pnpm seed load [--dry-run]` (docs/14-catalog-ingestion.md §14.5) — полный конвейер (шаги 1–7)
 * по ВСЕМ источникам `data/catalog/import/` и, если не `--dry-run`, идемпотентная загрузка
 * принятых записей в `devices` (`catalog_overrides` не трогается — ADR-014/docs/14 §14.5).
 *
 * Нарушение инвариантов §5.8, найденное ПОСЛЕ построения (запускается ДО загрузки, а не только
 * после — AGENTS.md, критерий готовности), карантинит только затронутые записи, а не блокирует
 * загрузку целиком (docs/09-decisions.md ADR-029; `result.devices` из `runAndBuildReport` уже
 * не содержит нарушителей — они исключены в `buildCatalog`). Загрузка отказывает целиком ТОЛЬКО
 * если доля таких карантинных записей относительно всех, прошедших консенсус, выше порога.
 */
export async function runLoadCommand(options: LoadCommandOptions): Promise<number> {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
  const reportsDir = options.reportsDir ?? DEFAULT_REPORTS_DIR;
  const ratioThreshold =
    options.invariantQuarantineRatioThreshold ?? DEFAULT_INVARIANT_QUARANTINE_RATIO_THRESHOLD;
  const { result, report, markdown } = runAndBuildReport({
    snapshotPath,
    ...(options.paths !== undefined ? { paths: options.paths } : {}),
  });

  process.stdout.write(`${markdown}\n`);
  writeReportFiles(reportsDir, new Date(report.generatedAt), markdown, report);

  const totalBeforeQuarantine = result.devices.length + result.invariantQuarantinedCount;
  const quarantineRatio =
    totalBeforeQuarantine === 0 ? 0 : result.invariantQuarantinedCount / totalBeforeQuarantine;

  if (quarantineRatio > ratioThreshold) {
    process.stderr.write(
      `Загрузка отменена: доля записей, карантинированных за нарушение инвариантов §5.8, ` +
        `${(quarantineRatio * 100).toFixed(1)}% выше порога ${(ratioThreshold * 100).toFixed(1)}% ` +
        `(${result.invariantQuarantinedCount} из ${totalBeforeQuarantine}, docs/05-data-model.md §5.8):\n`,
    );
    for (const violation of result.invariantViolations) {
      process.stderr.write(`  [${violation.code}] ${violation.message}\n`);
    }
    return 1;
  }

  if (result.invariantQuarantinedCount > 0) {
    process.stdout.write(
      `Карантинировано за нарушение инвариантов §5.8: ${result.invariantQuarantinedCount} из ` +
        `${totalBeforeQuarantine} (${(quarantineRatio * 100).toFixed(1)}%, порог ${(ratioThreshold * 100).toFixed(1)}%) — остальное загружается\n`,
    );
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

    // Этап 7 (docs/15-moderation.md §15.2) — карантин импорта и расхождения источников заводят
    // задачи очереди модерации напрямую при загрузке, а не только попадают в отчёт: без этого
    // строки, отброшенные конвейером, были бы видны исключительно в `reports/import-*.md`, а не
    // в рабочем инструменте специалиста (docs/15 §15.7). `catalog_overrides` этим шагом не
    // трогается — решения модератора не могут быть затронуты повторным `load` (docs/14 §14.5:
    // «идемпотентность... не затирает решения модератора»).
    const quarantineTasksCount = await writeCsvQuarantineTasks(connection, result.quarantine);
    const disagreementTasksCount = await writeSourceDisagreementTasks(
      connection,
      result.sourceDisagreements,
    );
    if (quarantineTasksCount > 0 || disagreementTasksCount > 0) {
      process.stdout.write(
        `Задачи модерации обновлены: ${quarantineTasksCount} карантин, ${disagreementTasksCount} расхождение источников\n`,
      );
    }
  } finally {
    await disconnectFromMongo(connection);
  }

  writeSnapshot(snapshotPath, result.devices);
  return 0;
}

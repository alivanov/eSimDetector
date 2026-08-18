import { DEFAULT_REPORTS_DIR } from '../defaults';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runAndBuildReport } from './shared';
import { writeReportFiles } from './report-helpers';

export interface ImportCommandOptions {
  readonly source?: string;
  readonly dryRun: boolean;
  readonly reportsDir?: string;
  readonly paths?: PipelinePaths;
}

/**
 * `pnpm seed import [--source <слаг>] [--dry-run]` (docs/14-catalog-ingestion.md §14.5) —
 * шаги 1–4 конвейера (разбор, нормализация, валидация, сверка с эталоном) для указанного
 * источника либо для всех источников `data/catalog/import/`, если `--source` не передан.
 * `--dry-run` печатает отчёт и не пишет файлы отчёта на диск (в MongoDB эта команда не пишет
 * никогда — до записи в базу данные проходят ещё три шага, `consensus`/`load`).
 */
export function runImportCommand(options: ImportCommandOptions): number {
  const { report, markdown } = runAndBuildReport({
    ...(options.source !== undefined ? { sources: [options.source] } : {}),
    ...(options.paths !== undefined ? { paths: options.paths } : {}),
  });

  process.stdout.write(`${markdown}\n`);

  if (!options.dryRun) {
    writeReportFiles(options.reportsDir ?? DEFAULT_REPORTS_DIR, new Date(report.generatedAt), markdown, report);
  }

  return 0;
}

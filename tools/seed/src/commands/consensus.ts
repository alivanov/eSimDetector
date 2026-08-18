import { DEFAULT_REPORTS_DIR } from '../defaults';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runAndBuildReport } from './shared';
import { writeReportFiles } from './report-helpers';

export interface ConsensusCommandOptions {
  readonly sources?: readonly string[];
  readonly dryRun: boolean;
  readonly reportsDir?: string;
  readonly paths?: PipelinePaths;
}

/**
 * `pnpm seed consensus [--sources a,b,c] [--dry-run]` (docs/14-catalog-ingestion.md §14.5) —
 * шаги 5–7 конвейера (консенсус, слияние с курируемым ядром/правилами, достоверность) над
 * ВСЕМИ обработанными источниками (либо перечисленными явно). В MongoDB не пишет — это делает
 * `load`.
 */
export function runConsensusCommand(options: ConsensusCommandOptions): number {
  const { report, markdown } = runAndBuildReport({
    ...(options.sources !== undefined ? { sources: options.sources } : {}),
    ...(options.paths !== undefined ? { paths: options.paths } : {}),
  });

  process.stdout.write(`${markdown}\n`);

  if (!options.dryRun) {
    writeReportFiles(options.reportsDir ?? DEFAULT_REPORTS_DIR, new Date(report.generatedAt), markdown, report);
  }

  return 0;
}

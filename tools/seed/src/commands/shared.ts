import {
  DEFAULT_FAMILY_MIN_RECORDS,
  DEFAULT_SNAPSHOT_PATH,
  defaultPipelinePaths,
} from '../defaults';
import {
  runPipeline,
  type PipelinePaths,
  type RunPipelineResult,
} from '../pipeline/pipeline-runner';
import { buildImportReport, renderMarkdown, type ImportReportData } from '../report/report';
import { readPreviousSnapshot } from './report-helpers';

export interface RunCommandOptions {
  readonly sources?: readonly string[];
  readonly now?: Date;
  readonly useCache?: boolean;
  readonly snapshotPath?: string;
  readonly paths?: PipelinePaths;
  readonly familyMinRecords?: number;
  /** Проброс к `RunPipelineOptions.excludedSources` — по умолчанию `DEFAULT_EXCLUDED_SOURCES`. */
  readonly excludedSources?: readonly string[];
}

export interface RunCommandOutcome {
  readonly result: RunPipelineResult;
  readonly report: ImportReportData;
  readonly markdown: string;
}

/** Общий запуск конвейера + построение отчёта — используется командами `import`/`consensus`/`load`. */
export function runAndBuildReport(options: RunCommandOptions = {}): RunCommandOutcome {
  const now = options.now ?? new Date();
  const result = runPipeline({
    paths: options.paths ?? defaultPipelinePaths(),
    now,
    familyMinRecords: options.familyMinRecords ?? DEFAULT_FAMILY_MIN_RECORDS,
    ...(options.sources !== undefined ? { sources: options.sources } : {}),
    ...(options.useCache !== undefined ? { useCache: options.useCache } : {}),
    ...(options.excludedSources !== undefined ? { excludedSources: options.excludedSources } : {}),
  });

  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
  const previousSnapshot = readPreviousSnapshot(snapshotPath);

  const report = buildImportReport({
    generatedAt: now,
    sourceFiles: result.sourceFiles,
    quarantine: result.quarantine,
    notices: result.notices,
    noDataCount: result.noDataCount,
    referenceChecked: result.referenceChecked,
    referenceMatched: result.referenceMatched,
    referenceFileMissing: result.referenceFileMissing,
    devices: result.devices,
    familyAggregates: result.familyAggregates,
    curatedAppliedCount: result.curatedAppliedCount,
    appleRuleAppliedCount: result.appleRuleAppliedCount,
    invariantViolationsCount: result.invariantViolations.length,
    invariantQuarantinedCount: result.invariantQuarantinedCount,
    codeSuffixBatch: result.codeSuffixBatch,
    ...(previousSnapshot !== undefined ? { previousSnapshot } : {}),
  });

  return { result, report, markdown: renderMarkdown(report) };
}

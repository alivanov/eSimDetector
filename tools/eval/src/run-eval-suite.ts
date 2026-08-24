import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveEvalOptions, type EvalProgress, type EvalSuiteOptions } from './lib/eval-options';
import { runDetectionEval } from './run-detection-eval';
import { runMatchingEval } from './run-matching-eval';

export interface EvalSuiteResult {
  readonly detectionFalsePositives: number;
  readonly matchingFalsePositives: number;
  readonly detectionTotal: number;
  readonly matchingTotal: number;
  readonly reportMarkdown: string;
}

function countJsonArrayEntries(relativeFromSrc: string): number {
  const path = join(__dirname, relativeFromSrc);
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  return Array.isArray(parsed) ? parsed.length : 0;
}

/**
 * Оба контура стенда подряд (как `pnpm eval`), с единым прогрессом и одним сводным Markdown.
 * Админ-API вызывает эту функцию с `baseUrl=http://127.0.0.1:${PORT}`, админ-токеном и
 * `intervalMs: 0`; CLI — через `resolveEvalCliOptions()`.
 */
export async function runEvalSuite(options: EvalSuiteOptions = {}): Promise<EvalSuiteResult> {
  const resolved = resolveEvalOptions({ ...options, writeToDisk: options.writeToDisk ?? false });
  const reports: string[] = [];
  const detectionExpected = countJsonArrayEntries('../../../data/fixtures/signals.golden.json');
  const matchingExpected = countJsonArrayEntries('../../../data/fixtures/queries.golden.json');
  const grandTotal = detectionExpected + matchingExpected;

  const emitProgress = async (progress: EvalProgress): Promise<void> => {
    if (resolved.onProgress !== undefined) {
      await resolved.onProgress(progress);
    }
  };

  const detection = await runDetectionEval({
    baseUrl: resolved.baseUrl,
    intervalMs: resolved.intervalMs,
    headers: resolved.headers,
    writeToDisk: false,
    onProgress: async (progress) => {
      await emitProgress({
        phase: 'detection',
        completed: progress.completed,
        total: grandTotal,
      });
    },
    onReport: (_name, markdown) => {
      reports.push(markdown);
    },
  });

  const matching = await runMatchingEval({
    baseUrl: resolved.baseUrl,
    intervalMs: resolved.intervalMs,
    headers: resolved.headers,
    writeToDisk: false,
    onProgress: async (progress) => {
      await emitProgress({
        phase: 'matching',
        completed: detection.total + progress.completed,
        total: grandTotal,
      });
    },
    onReport: (_name, markdown) => {
      reports.push(markdown);
    },
  });

  const reportMarkdown = reports.join('\n---\n\n');
  if (resolved.onReport !== undefined) {
    await resolved.onReport(
      `eval-suite-${new Date().toISOString().slice(0, 10)}.md`,
      reportMarkdown,
    );
  }

  return {
    detectionFalsePositives: detection.falsePositives,
    matchingFalsePositives: matching.falsePositives,
    detectionTotal: detection.total,
    matchingTotal: matching.total,
    reportMarkdown,
  };
}

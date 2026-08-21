import signalsGoldenJson from '../../../data/fixtures/signals.golden.json';

import { postJson } from './lib/http-json';
import { EVAL_REQUEST_INTERVAL_MS, sleep } from './lib/pace';
import { parseDetectResponse } from './lib/parse-api-responses';
import {
  printSummaryToConsole,
  renderReport,
  writeReportFile,
  type CategoryRow,
} from './lib/report';
import { parseSignalsGolden, type SignalsGoldenEntry } from './signals-golden';

/**
 * `pnpm eval:detection` (docs/08-testing-and-quality.md §8.6) — прогоняет `signals.golden.json`
 * (121 запись, все девять групп, docs/08 §8.4) через `POST /api/v1/detect` РАБОТАЮЩЕГО контура
 * и сверяет ответ с `expected`. Требует поднятого и наполненного контура (`docker compose up -d`
 * + `pnpm seed load && pnpm seed rebuild-signatures`, docs/07 §7.6) — без второй команды
 * наполнения ветка iOS деградирует до правила версии ОС, и доля уточнений искусственно растёт.
 */

interface EvalRow {
  readonly entry: SignalsGoldenEntry;
  readonly ok: boolean;
  readonly correct: boolean;
  readonly falsePositive: boolean;
  readonly correctClarification: boolean;
  readonly excessClarification: boolean;
  readonly automatic: boolean;
  readonly error?: string;
}

async function evaluateEntry(entry: SignalsGoldenEntry): Promise<EvalRow> {
  try {
    const body = {
      signals: entry.signals,
      ...(entry.region !== undefined ? { context: { region: entry.region } } : {}),
    };
    const raw = await postJson('/api/v1/detect', body, entry.headers);
    const parsed = parseDetectResponse(raw, entry.id);

    const expected = entry.expected;
    const statusMatches = parsed.status === expected.status;
    const correct =
      statusMatches &&
      parsed.platform === expected.platform &&
      parsed.deviceType === expected.deviceType &&
      parsed.exactModelKnown === expected.exactModelKnown &&
      (!expected.exactModelKnown || parsed.deviceId === expected.deviceId);

    const automatic = parsed.status !== 'clarification_required';
    // Ложное определение — сервис выдал ОДНОЗНАЧНЫЙ ответ (не уточнение), не совпавший с
    // ожидаемым статусом: именно такой исход штрафуется критерием К1 (AGENTS.md, правило 1).
    const falsePositive = automatic && parsed.status !== expected.status;
    const correctClarification =
      expected.status === 'clarification_required' && parsed.status === 'clarification_required';
    const excessClarification =
      expected.status !== 'clarification_required' && parsed.status === 'clarification_required';

    return {
      entry,
      ok: true,
      correct,
      falsePositive,
      correctClarification,
      excessClarification,
      automatic,
    };
  } catch (error) {
    return {
      entry,
      ok: false,
      correct: false,
      falsePositive: false,
      correctClarification: false,
      excessClarification: false,
      automatic: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildCategoryRows(rows: readonly EvalRow[]): CategoryRow[] {
  const byCategory = new Map<string, EvalRow[]>();
  for (const row of rows) {
    const bucket = byCategory.get(row.entry.category) ?? [];
    bucket.push(row);
    byCategory.set(row.entry.category, bucket);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryRows]) => ({
      category,
      total: categoryRows.length,
      correct: categoryRows.filter((row) => row.correct).length,
      falsePositives: categoryRows.filter((row) => row.falsePositive).length,
      expectedClarificationTotal: categoryRows.filter(
        (row) => row.entry.expected.status === 'clarification_required',
      ).length,
      correctClarifications: categoryRows.filter((row) => row.correctClarification).length,
      expectedDeterminateTotal: categoryRows.filter(
        (row) => row.entry.expected.status !== 'clarification_required',
      ).length,
      excessClarifications: categoryRows.filter((row) => row.excessClarification).length,
      automatic: categoryRows.filter((row) => row.automatic).length,
    }));
}

export async function runDetectionEval(): Promise<{ readonly falsePositives: number }> {
  const { entries, errors: parseErrors } = parseSignalsGolden(signalsGoldenJson);
  if (entries.length === 0) {
    throw new Error(
      `data/fixtures/signals.golden.json не содержит валидных записей: ${parseErrors.join('; ')}`,
    );
  }

  // Последовательно, с паузой (`lib/pace.ts`) — не «залпом» `Promise.all`: 121 запрос без пауз
  // рискует упереться в собственный `RateLimitGuard` сервиса (docs/07 §7.8) и дать ложные ошибки
  // прогона вместо результата определения.
  const results: EvalRow[] = [];
  for (const entry of entries) {
    results.push(await evaluateEntry(entry));
    await sleep(EVAL_REQUEST_INTERVAL_MS);
  }
  const runtimeErrors = results
    .filter((row) => !row.ok)
    .map((row) => `${row.entry.id}: ${row.error ?? 'неизвестная ошибка'}`);

  const report = renderReport({
    title: 'Стенд оценки качества — автоопределение (К1, signals.golden.json)',
    generatedAt: new Date().toISOString(),
    total: results.length,
    rows: buildCategoryRows(results),
    errors: [...parseErrors, ...runtimeErrors],
  });

  printSummaryToConsole({
    title: 'Автоопределение (К1)',
    generatedAt: new Date().toISOString(),
    total: results.length,
    rows: buildCategoryRows(results),
    errors: [...parseErrors, ...runtimeErrors],
  });

  const path = writeReportFile(
    `eval-detection-${new Date().toISOString().slice(0, 10)}.md`,
    report,
  );
  console.log(`Отчёт записан: ${path}`);

  return { falsePositives: results.filter((row) => row.falsePositive).length };
}

if (require.main === module) {
  runDetectionEval()
    .then(({ falsePositives }) => {
      if (falsePositives > 0) {
        console.error(
          `Обнаружены ложные определения: ${falsePositives} — целевое значение по К1 равно нулю`,
        );
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error('Прогон стенда оценки качества (автоопределение) не выполнен:', error);
      process.exitCode = 1;
    });
}

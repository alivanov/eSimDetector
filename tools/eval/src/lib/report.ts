import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPORTS_DIR = join(__dirname, '../../../../reports');

export interface CategoryRow {
  readonly category: string;
  readonly total: number;
  readonly correct: number;
  readonly falsePositives: number;
  /** Знаменатель для «доля корректных уточнений» — записей, где уточнение ОЖИДАЛОСЬ. */
  readonly expectedClarificationTotal: number;
  readonly correctClarifications: number;
  /** Знаменатель для «доля избыточных уточнений» — записей, где ожидался ОПРЕДЕЛЁННЫЙ ответ. */
  readonly expectedDeterminateTotal: number;
  readonly excessClarifications: number;
  readonly automatic: number;
}

export interface EvalSummary {
  readonly title: string;
  readonly generatedAt: string;
  readonly total: number;
  readonly rows: readonly CategoryRow[];
  readonly errors: readonly string[];
  /** Свободный текст, поясняющий известные ограничения интерпретации метрик (см. `run-matching-eval.ts`). */
  readonly notes?: readonly string[];
}

function percent(count: number, total: number): string {
  if (total === 0) {
    return '—';
  }
  return `${((count / total) * 100).toFixed(1)}%`;
}

type NumericCategoryField = Exclude<keyof CategoryRow, 'category'>;

function sumField(rows: readonly CategoryRow[], field: NumericCategoryField): number {
  return rows.reduce((acc, row) => acc + row[field], 0);
}

interface Totals {
  readonly total: number;
  readonly correct: number;
  readonly falsePositives: number;
  readonly expectedClarificationTotal: number;
  readonly correctClarifications: number;
  readonly expectedDeterminateTotal: number;
  readonly excessClarifications: number;
  readonly automatic: number;
}

function computeTotals(rows: readonly CategoryRow[]): Totals {
  return {
    total: sumField(rows, 'total'),
    correct: sumField(rows, 'correct'),
    falsePositives: sumField(rows, 'falsePositives'),
    expectedClarificationTotal: sumField(rows, 'expectedClarificationTotal'),
    correctClarifications: sumField(rows, 'correctClarifications'),
    expectedDeterminateTotal: sumField(rows, 'expectedDeterminateTotal'),
    excessClarifications: sumField(rows, 'excessClarifications'),
    automatic: sumField(rows, 'automatic'),
  };
}

/**
 * Markdown-отчёт стенда оценки качества (docs/08-testing-and-quality.md §8.6) — формируется и в
 * файл `reports/`, и на консоль, чтобы результат можно было и предъявить комиссии файлом, и
 * увидеть сразу же после запуска команды.
 *
 * «Доля корректных уточнений»/«доля избыточных уточнений» — условные доли (docs/08 §8.6: «Ожидалось
 * уточнение — получено уточнение» / «Определение было возможно, но выдано уточнение»), поэтому их
 * знаменатель — не общее число записей, а число записей соответствующего ожидания
 * (`expectedClarificationTotal`/`expectedDeterminateTotal`), а не `total`.
 */
export function renderReport(summary: EvalSummary): string {
  const t = computeTotals(summary.rows);

  const lines: string[] = [];
  lines.push(`# ${summary.title}`);
  lines.push('');
  lines.push(`Сформирован: ${summary.generatedAt}`);
  lines.push('');
  lines.push('## Сводные показатели (docs/08-testing-and-quality.md §8.6)');
  lines.push('');
  lines.push('| Метрика | Значение | Целевое значение |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Всего записей | ${t.total} | — |`);
  lines.push(`| Доля верных определений | ${percent(t.correct, t.total)} | ≥ 95% |`);
  lines.push(`| **Доля ложных определений** | **${percent(t.falsePositives, t.total)}** | **0** |`);
  lines.push(
    `| Доля корректных уточнений (из ${t.expectedClarificationTotal} записей, где ожидалось уточнение) | ${percent(t.correctClarifications, t.expectedClarificationTotal)} | ≥ 95% |`,
  );
  lines.push(
    `| Доля избыточных уточнений (из ${t.expectedDeterminateTotal} записей, где ожидался определённый ответ) | ${percent(t.excessClarifications, t.expectedDeterminateTotal)} | ≤ 10% |`,
  );
  lines.push(`| Доля автоматических ответов | ${percent(t.automatic, t.total)} | измеряется |`);
  lines.push('');
  lines.push('## Разбивка по категориям');
  lines.push('');
  lines.push(
    '| Категория | Записей | Верно | Ложно | Уточнение верно | Уточнение избыточно | Автоматически |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of summary.rows) {
    lines.push(
      `| ${row.category} | ${row.total} | ${percent(row.correct, row.total)} | ${percent(
        row.falsePositives,
        row.total,
      )} | ${percent(row.correctClarifications, row.expectedClarificationTotal)} | ${percent(
        row.excessClarifications,
        row.expectedDeterminateTotal,
      )} | ${percent(row.automatic, row.total)} |`,
    );
  }
  if (summary.notes !== undefined && summary.notes.length > 0) {
    lines.push('');
    lines.push('## Известные ограничения интерпретации');
    lines.push('');
    for (const note of summary.notes) {
      lines.push(note);
      lines.push('');
    }
  }
  if (summary.errors.length > 0) {
    lines.push('');
    lines.push(`## Ошибки прогона (${summary.errors.length})`);
    lines.push('');
    for (const error of summary.errors) {
      lines.push(`- ${error}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function printSummaryToConsole(summary: EvalSummary): void {
  const t = computeTotals(summary.rows);

  console.log(`\n${summary.title}`);
  console.log(`Всего записей: ${t.total}`);
  console.log(`Доля верных определений: ${percent(t.correct, t.total)} (цель ≥ 95%)`);
  console.log(`Доля ложных определений: ${percent(t.falsePositives, t.total)} (цель 0)`);
  console.log(
    `Доля корректных уточнений: ${percent(t.correctClarifications, t.expectedClarificationTotal)} (цель ≥ 95%, из ${t.expectedClarificationTotal} записей)`,
  );
  console.log(
    `Доля избыточных уточнений: ${percent(t.excessClarifications, t.expectedDeterminateTotal)} (цель ≤ 10%, из ${t.expectedDeterminateTotal} записей)`,
  );
  console.log(`Доля автоматических ответов: ${percent(t.automatic, t.total)}`);
  if (summary.errors.length > 0) {
    console.log(`Ошибок прогона: ${summary.errors.length} (см. файл отчёта)`);
  }
}

export function writeReportFile(fileName: string, content: string): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, fileName);
  writeFileSync(path, content, 'utf-8');
  return path;
}

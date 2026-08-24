import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveEvalCliOptions,
  resolveEvalOptions,
  type EvalSuiteOptions,
} from './lib/eval-options';
import { getJson } from './lib/http-json';
import { sleep } from './lib/pace';
import { parseSearchResponse } from './lib/parse-api-responses';
import { resolveActualOutcome } from './lib/resolve-actual-outcome';
import {
  printSummaryToConsole,
  renderReport,
  writeReportFile,
  type CategoryRow,
} from './lib/report';

/**
 * `pnpm eval:matching` (docs/08-testing-and-quality.md §8.6, §8.4 «aspirational-поля») —
 * прогоняет `queries.golden.json` (362 записи, 11 категорий К2) через `GET /api/v1/devices/search`
 * РАБОТАЮЩЕГО контура и сверяет исход (`match`/`clarification`/`not_found`) с `expectedOutcome`.
 * Это первая по времени сверка этих полей: до появления полного конвейера сопоставления (модули
 * `matching`/`CatalogModule`) они были "целевыми", а не проверяемыми (docs/08 §8.4).
 *
 * Слотовый разбор (`expectedSlots`) уже проверяется отдельно на `normalizeQuery` напрямую, без
 * HTTP (`tools/eval/src/data-files.spec.ts`) — здесь сверяется исход ПОЛНОГО конвейера, включая
 * отбор кандидатов по индексам справочника и правило принятия решения (§4.6—4.7 docs/04), а не
 * только нормализация запроса.
 */

/**
 * `expectedOutcome`/`expectedDeviceId` — «aspirational»-поля (docs/08-testing-and-quality.md §8.4).
 * Расхождения с полным конвейером почти целиком относятся к причинам вне дефекта `matching`:
 *
 * 1. **Дыры справочника вне курируемого ядра.** Линейка Samsung Galaxy S23/S24 и часть дыр О-8
 *    (POCO X5 Pro, Nokia 2.4) заведены курируемо (`data/catalog/curated/…`, снимок
 *    `0cf9311056f6`). Остаются модели вне снимка (S22 Ultra, Note 13 Pro Plus, vivo Y36,
 *    Tecno Spark 10 без авторитетного URL и т.п.) — `not_found` для них корректен.
 * 2. **Идентификаторы до ADR-029.** Часть записей ещё ссылалась на `xiaomi-redmi-*`; точечная
 *    сверка golden после C/`515c4fd` закрыла известные расхождения, но полное покрытие выборки
 *    не гарантируется.
 * 3. **Узкий справочник vs воображаемые коллизии.** `ambiguous` / `foreign-input` могут ожидать
 *    конфликт или перевод, которого в фактическом снимке нет.
 *
 * Числа стенда — измеренные без корректировки. Канон метрик — docs/appendix-b-quality-report.md.
 */
const MATCHING_EVAL_KNOWN_LIMITATIONS: readonly string[] = [
  '`expectedOutcome`/`expectedDeviceId` в `queries.golden.json` — aspirational-поля (docs/08 §8.4). Большинство расхождений не дефект `matching`/`detection`: (1) дыры справочника вне курируемого ядра — S23/S24 и часть О-8 уже в снимке `0cf9311056f6`, но S22 Ultra / Note 13 Pro Plus / vivo Y36 / Tecno Spark 10 и др. отсутствуют → `not_found` корректен; (2) отдельные идентификаторы до ADR-029 (`xiaomi-redmi-*` vs `redmi-*`/`poco-*`); (3) коллизии `ambiguous`/`foreign-input`, которых в узком снимке нет.',
  'Приведённые числа — измеренные, без корректировки. Канон К1/К2 после цепочки «Устранение остатков сдачи» — docs/appendix-b-quality-report.md. Массовая переразметка golden и наполнение справочника из CSV — вне объёма стенда.',
];

type ExpectedOutcome = 'match' | 'clarification' | 'not_found';

interface GoldenQueryEntry {
  readonly id: string;
  readonly query: string;
  readonly category: string;
  readonly expectedOutcome: ExpectedOutcome;
  readonly expectedDeviceId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExpectedOutcome(value: unknown): value is ExpectedOutcome {
  return value === 'match' || value === 'clarification' || value === 'not_found';
}

function parseGoldenQueries(value: unknown): { entries: GoldenQueryEntry[]; errors: string[] } {
  const errors: string[] = [];
  const entries: GoldenQueryEntry[] = [];
  if (!Array.isArray(value)) {
    return { entries, errors: ['queries.golden.json: ожидался массив'] };
  }
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`[${index}]: ожидался объект`);
      return;
    }
    const { id, query, category, expectedOutcome, expectedDeviceId } = item;
    if (
      typeof id !== 'string' ||
      typeof query !== 'string' ||
      typeof category !== 'string' ||
      !isExpectedOutcome(expectedOutcome) ||
      (expectedDeviceId !== null && typeof expectedDeviceId !== 'string')
    ) {
      errors.push(`[${index}]: не соответствует ожидаемой форме записи`);
      return;
    }
    entries.push({ id, query, category, expectedOutcome, expectedDeviceId });
  });
  return { entries, errors };
}

function loadQueriesGoldenJson(): unknown {
  const path = join(__dirname, '../../../data/fixtures/queries.golden.json');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  return parsed;
}

interface EvalRow {
  readonly entry: GoldenQueryEntry;
  readonly ok: boolean;
  readonly correct: boolean;
  readonly falsePositive: boolean;
  readonly correctClarification: boolean;
  readonly excessClarification: boolean;
  readonly automatic: boolean;
  readonly error?: string;
}

/**
 * Пустой запрос (категория `foreign-input`, docs/08 §8.4: «пустая строка») никогда не достигает
 * матчера: граница API отклоняет его на уровне DTO (`q` обязателен, 1–100 символов,
 * `.cursor/rules/api-boundaries.mdc`) кодом `VALIDATION_ERROR` (400) раньше, чем мог бы
 * сработать алгоритм сопоставления. Это не ошибка прогона стенда и не ложный ответ — трактуется
 * как ожидаемое `not_found` (устройство не определено ни при каких обстоятельствах), а не как
 * сбой HTTP.
 */
function isEmptyQueryValidationError(entry: GoldenQueryEntry, error: unknown): boolean {
  return (
    entry.query.trim().length === 0 && error instanceof Error && error.message.includes('HTTP 400')
  );
}

async function evaluateEntry(
  entry: GoldenQueryEntry,
  http: { readonly baseUrl: string; readonly headers: Readonly<Record<string, string>> },
): Promise<EvalRow> {
  try {
    const raw = await getJson(`/api/v1/devices/search?q=${encodeURIComponent(entry.query)}`, http);
    const parsed = parseSearchResponse(raw, entry.id);
    const actualOutcome = resolveActualOutcome(parsed);

    const outcomeMatches = actualOutcome === entry.expectedOutcome;
    // Группа эквивалентности (ADR-002): status supported/not_supported при device: null —
    // честный ответ без точной модели. Если golden ждал match с конкретным id, совпадение
    // статуса группы засчитывается: сервис не назвал чужое устройство.
    // То же для группы с общим answer_question (ADR-045): условие одно, модель выбирать не нужно.
    const groupStatusWithoutDevice =
      parsed.deviceId === null &&
      (parsed.status === 'supported' ||
        parsed.status === 'not_supported' ||
        (parsed.status === 'clarification_required' &&
          (parsed.clarificationKind === 'answer_question' ||
            parsed.clarificationKind === 'check_on_device')));
    const deviceMatches =
      entry.expectedDeviceId === null ||
      parsed.deviceId === entry.expectedDeviceId ||
      (groupStatusWithoutDevice && entry.expectedOutcome === 'match');
    const correct = outcomeMatches && deviceMatches;

    const automatic = actualOutcome === 'match';
    // Ложное определение К2 — сервис уверенно НАЗВАЛ устройство (непустой deviceId), но не то,
    // что ожидалось, либо назвал устройство там, где ожидался отказ/уточнение (AGENTS.md,
    // правило 1). Ответ группы без device — не ложное имя модели.
    const falsePositive = actualOutcome === 'match' && parsed.deviceId !== null && !correct;
    const correctClarification =
      entry.expectedOutcome === 'clarification' && actualOutcome === 'clarification';
    const excessClarification =
      entry.expectedOutcome === 'match' && actualOutcome === 'clarification';

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
    if (isEmptyQueryValidationError(entry, error)) {
      const correct = entry.expectedOutcome === 'not_found';
      return {
        entry,
        ok: true,
        correct,
        falsePositive: false,
        correctClarification: false,
        excessClarification: false,
        automatic: false,
      };
    }
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
        (row) => row.entry.expectedOutcome === 'clarification',
      ).length,
      correctClarifications: categoryRows.filter((row) => row.correctClarification).length,
      expectedDeterminateTotal: categoryRows.filter((row) => row.entry.expectedOutcome === 'match')
        .length,
      excessClarifications: categoryRows.filter((row) => row.excessClarification).length,
      automatic: categoryRows.filter((row) => row.automatic).length,
    }));
}

export interface MatchingEvalResult {
  readonly falsePositives: number;
  readonly total: number;
  readonly reportMarkdown: string;
}

export async function runMatchingEval(options: EvalSuiteOptions = {}): Promise<MatchingEvalResult> {
  const resolved = resolveEvalOptions(options);
  const { entries, errors: parseErrors } = parseGoldenQueries(loadQueriesGoldenJson());
  if (entries.length === 0) {
    throw new Error(
      `data/fixtures/queries.golden.json не содержит валидных записей: ${parseErrors.join('; ')}`,
    );
  }

  const http = { baseUrl: resolved.baseUrl, headers: resolved.headers };
  const results: EvalRow[] = [];
  // Последовательно, с паузой (`lib/pace.ts`), а не `Promise.all`: 362 записи против одного
  // HTTP-сервера — параллельный залп рискует упереться в `RateLimitGuard` (docs/07 §7.8,
  // `RATE_LIMIT_RPM`), который стенд обязан застать в работе, а не отключать ради своего прогона.
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    results.push(await evaluateEntry(entry, http));
    if (resolved.onProgress !== undefined) {
      await resolved.onProgress({
        phase: 'matching',
        completed: index + 1,
        total: entries.length,
      });
    }
    if (resolved.intervalMs > 0) {
      await sleep(resolved.intervalMs);
    }
  }

  const runtimeErrors = results
    .filter((row) => !row.ok)
    .map((row) => `${row.entry.id}: ${row.error ?? 'неизвестная ошибка'}`);

  const rows = buildCategoryRows(results);
  const generatedAt = new Date().toISOString();
  const summary = {
    title: 'Стенд оценки качества — обработка ввода (К2, queries.golden.json)',
    generatedAt,
    total: results.length,
    rows,
    errors: [...parseErrors, ...runtimeErrors],
    notes: MATCHING_EVAL_KNOWN_LIMITATIONS,
  };

  const report = renderReport(summary);

  if (resolved.writeToDisk) {
    printSummaryToConsole({ ...summary, title: 'Обработка ввода (К2)' });
    const path = writeReportFile(
      `eval-matching-${new Date().toISOString().slice(0, 10)}.md`,
      report,
    );
    console.log(`Отчёт записан: ${path}`);
  }

  if (resolved.onReport !== undefined) {
    await resolved.onReport(`eval-matching-${new Date().toISOString().slice(0, 10)}.md`, report);
  }

  return {
    falsePositives: results.filter((row) => row.falsePositive).length,
    total: results.length,
    reportMarkdown: report,
  };
}

if (require.main === module) {
  runMatchingEval(resolveEvalCliOptions())
    .then(({ falsePositives }) => {
      if (falsePositives > 0) {
        console.error(
          `Обнаружены ложные определения: ${falsePositives} — целевое значение по К2 равно нулю`,
        );
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error('Прогон стенда оценки качества (обработка ввода) не выполнен:', error);
      process.exitCode = 1;
    });
}

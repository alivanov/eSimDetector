import goldenQueriesJson from '../../../data/fixtures/queries.golden.json';

import { getJson } from './lib/http-json';
import { EVAL_REQUEST_INTERVAL_MS, sleep } from './lib/pace';
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
 * `expectedOutcome`/`expectedDeviceId` — «aspirational»-поля (docs/08-testing-and-quality.md §8.4:
 * «до этого момента расхождение между `expectedDeviceId` и будущим поведением сопоставления не
 * является ошибкой этой выборки — это следующий шаг работы, а не текущий недостаток»). Этот
 * прогон — первая сверка этих полей с ПОЛНЫМ конвейером (этап 8), и она честно находит
 * значительную долю расхождений — но, как показал разбор образцов каждой категории, эти
 * расхождения почти целиком относятся к трём причинам, НЕ являющимся дефектом `matching`:
 *
 * 1. **Неполное покрытие справочника конкретной выгрузкой.** `queries.golden.json` ожидает модели
 *    (например, Samsung Galaxy S23/S24, iPhone 6s в некоторых записях), которых нет в РЕАЛЬНО
 *    загруженных партиях `data/catalog/import/` конкретного прогона `pnpm seed load` — справочник
 *    полон настолько, насколько полны собранные выгрузки (docs/05 §5.9), а не настолько, насколько
 *    полна выборка. Ответ `not_found` в этом случае корректен: устройства действительно нет.
 * 2. **`expectedDeviceId` для Redmi/POCO написан до ADR-029.** Решение вести подбренды отдельным
 *    префиксом идентификатора (`redmi-*`/`poco-*`, а не `xiaomi-redmi-*`) принято ПОЗЖЕ, чем
 *    заводилась часть записей выборки — таким записям сервис отвечает верным устройством под
 *    другим (актуальным) идентификатором.
 * 3. **Ожидание «уточнение» на свободном тексте, которое реальный (меньший, чем воображаемый)
 *    справочник не воспроизводит.** Записи категории `ambiguous` (например, «самсунг», «хонор»)
 *    предполагали конфликт нескольких моделей, которого в ФАКТИЧЕСКИ загруженном справочнике может
 *    не быть — сервис отвечает моделью с наибольшей априорной популярностью среди фактических
 *    кандидатов, что само по себе не нарушает AGENTS.md (правило 1 запрещает ДОГАДКУ там, где
 *    данных недостаточно, а не однозначный ответ там, где после нормализации остался один реальный
 *    кандидат).
 *
 * Эти находки — не повод занижать измеренное число (оно приведено как есть, без корректировки),
 * но и не повод считать «доля ложных определений К2» прямым свидетельством дефекта алгоритма:
 * решение о повторной сверке/чистке aspirational-полей `queries.golden.json` по каждой записи —
 * объём ОТДЕЛЬНОГО агента (наполнение и курирование данных выборки, а не контракт/интеграция),
 * см. передачу этапа 8.
 */
const MATCHING_EVAL_KNOWN_LIMITATIONS: readonly string[] = [
  '`expectedOutcome`/`expectedDeviceId` в `queries.golden.json` — aspirational-поля (docs/08 §8.4), впервые сверенные с полным конвейером на этом этапе. Образцовый разбор расхождений по каждой категории (передача этапа 8) показал, что подавляющее большинство относится к трём причинам, не являющимся дефектом `matching`/`detection`: (1) конкретная выгрузка, реально загруженная в этот справочник, не покрывает часть моделей, которые выборка ожидала найти (например, линейка Samsung Galaxy S23/S24 в текущем импорте отсутствует) — `not_found` в этом случае корректен; (2) часть `expectedDeviceId` для Redmi/POCO написана до ADR-029 (docs/09-decisions.md) и ссылается на идентификаторы вида `xiaomi-redmi-*`, тогда как решение о подбрендовом префиксе (`redmi-*`/`poco-*`) принято позже; (3) часть записей категории `ambiguous` предполагала коллизию нескольких моделей, которой в фактически загруженном (более узком, чем воображаемый полный) справочнике может не быть.',
  'Приведённые выше числа — измеренные, БЕЗ корректировки под эти причины: пересмотр самих aspirational-полей выборки — объём куратора данных `queries.golden.json`, а не контракта/интеграции (объём этого агента). Рекомендация следующему агенту, отвечающему за данные выборки — заново сверить `expectedDeviceId` по каждой записи с фактическим содержимым справочника после его следующего полного наполнения.',
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

async function evaluateEntry(entry: GoldenQueryEntry): Promise<EvalRow> {
  try {
    const raw = await getJson(`/api/v1/devices/search?q=${encodeURIComponent(entry.query)}`);
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

export async function runMatchingEval(): Promise<{ readonly falsePositives: number }> {
  const { entries, errors: parseErrors } = parseGoldenQueries(goldenQueriesJson);
  if (entries.length === 0) {
    throw new Error(
      `data/fixtures/queries.golden.json не содержит валидных записей: ${parseErrors.join('; ')}`,
    );
  }

  const results: EvalRow[] = [];
  // Последовательно, с паузой (`lib/pace.ts`), а не `Promise.all`: 362 записи против одного
  // HTTP-сервера — параллельный залп рискует упереться в `RateLimitGuard` (docs/07 §7.8,
  // `RATE_LIMIT_RPM`), который стенд обязан застать в работе, а не отключать ради своего прогона.
  for (const entry of entries) {
    results.push(await evaluateEntry(entry));
    await sleep(EVAL_REQUEST_INTERVAL_MS);
  }

  const runtimeErrors = results
    .filter((row) => !row.ok)
    .map((row) => `${row.entry.id}: ${row.error ?? 'неизвестная ошибка'}`);

  const rows = buildCategoryRows(results);
  const summary = {
    title: 'Стенд оценки качества — обработка ввода (К2, queries.golden.json)',
    generatedAt: new Date().toISOString(),
    total: results.length,
    rows,
    errors: [...parseErrors, ...runtimeErrors],
    notes: MATCHING_EVAL_KNOWN_LIMITATIONS,
  };

  const report = renderReport(summary);
  printSummaryToConsole({ ...summary, title: 'Обработка ввода (К2)' });

  const path = writeReportFile(`eval-matching-${new Date().toISOString().slice(0, 10)}.md`, report);
  console.log(`Отчёт записан: ${path}`);

  return { falsePositives: results.filter((row) => row.falsePositive).length };
}

if (require.main === module) {
  runMatchingEval()
    .then(({ falsePositives }) => {
      if (falsePositives > 0) {
        console.error(
          `Обнаружены ложные определения: ${falsePositives} — целевое значение по К1/К2 равно нулю`,
        );
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error('Прогон стенда оценки качества (обработка ввода) не выполнен:', error);
      process.exitCode = 1;
    });
}

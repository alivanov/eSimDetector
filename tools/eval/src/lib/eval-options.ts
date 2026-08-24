import { EVAL_REQUEST_INTERVAL_MS } from './pace';
import { resolveApiBaseUrl } from './http-json';

/**
 * Параметры программного прогона стенда (docs/08 §8.6) — CLI и админ-API (`POST /admin/eval/runs`)
 * используют один конвейер; отличаются только базовый URL, пауза, заголовки и приёмник отчёта.
 */
export interface EvalProgress {
  readonly phase: 'detection' | 'matching';
  readonly completed: number;
  readonly total: number;
}

export interface EvalSuiteOptions {
  /** Базовый URL API; по умолчанию `EVAL_API_BASE_URL` или `http://localhost:3000`. */
  readonly baseUrl?: string;
  /** Пауза между запросами; `0` — без паузы (когда запросы идут с валидным `X-Admin-Token`). */
  readonly intervalMs?: number;
  /** Дополнительные заголовки каждого запроса (например `X-Admin-Token`). */
  readonly headers?: Readonly<Record<string, string>>;
  /** Вызыва после каждого запроса к API (для опроса прогресса из админки). */
  readonly onProgress?: (progress: EvalProgress) => void | Promise<void>;
  /**
   * Приёмник Markdown-отчёта. Если задан — файл на диск не пишется (админ-API хранит отчёт
   * в MongoDB: диск контейнера эфемерен).
   */
  readonly onReport?: (fileName: string, markdown: string) => void | Promise<void>;
  /** Писать отчёт в `reports/` (по умолчанию `true` для CLI, `false` если задан `onReport`). */
  readonly writeToDisk?: boolean;
}

export interface ResolvedEvalOptions {
  readonly baseUrl: string;
  readonly intervalMs: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly onProgress: ((progress: EvalProgress) => void | Promise<void>) | undefined;
  readonly onReport: ((fileName: string, markdown: string) => void | Promise<void>) | undefined;
  readonly writeToDisk: boolean;
}

export function resolveEvalOptions(options: EvalSuiteOptions = {}): ResolvedEvalOptions {
  const onReport = options.onReport;
  const writeToDisk = options.writeToDisk ?? onReport === undefined;
  return {
    baseUrl: options.baseUrl ?? resolveApiBaseUrl(),
    intervalMs: options.intervalMs ?? EVAL_REQUEST_INTERVAL_MS,
    headers: options.headers ?? {},
    onProgress: options.onProgress,
    onReport,
    writeToDisk,
  };
}

/**
 * Опции CLI `pnpm eval`: при непустом `ADMIN_TOKEN` запросы идут с `X-Admin-Token` без паузы
 * (обход `RATE_LIMIT` на сервере), иначе — прежняя пауза 700 мс.
 */
export function resolveEvalCliOptions(): EvalSuiteOptions {
  const adminToken = process.env['ADMIN_TOKEN'];
  const hasToken = typeof adminToken === 'string' && adminToken.length > 0;
  return {
    intervalMs: hasToken ? 0 : EVAL_REQUEST_INTERVAL_MS,
    headers: hasToken && adminToken !== undefined ? { 'X-Admin-Token': adminToken } : {},
    writeToDisk: true,
  };
}

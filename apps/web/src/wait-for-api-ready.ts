const HEALTH_LIVE_PATH = '/health/live';
const DEFAULT_MAX_WAIT_MS = 90_000;
const DEFAULT_RETRY_INTERVAL_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function joinUrl(apiBase: string, path: string): string {
  if (apiBase.length === 0) {
    return path;
  }
  return `${apiBase.replace(/\/+$/, '')}${path}`;
}

/** Ответ `GET /health/live` (docs/06 §6.1 — вне контракта ошибок, простой JSON). */
function isHealthLiveOk(body: unknown): boolean {
  if (!isRecord(body)) {
    return false;
  }
  return body['status'] === 'ok';
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** HTTP-коды, при которых на Free Render API ещё просыпается или край режет пробуждение. */
function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export interface WaitForApiReadyOptions {
  readonly apiBase?: string;
  readonly maxWaitMs?: number;
  readonly retryIntervalMs?: number;
  readonly fetchFn?: typeof fetch;
  readonly sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Дожидается ответа `GET /health/live` через тот же origin, что и демо-приложение (прокси nginx
 * или Vite). Нужен для бесплатного Render: API и веб — разные Web Service, при заходе на `/`
 * просыпается только веб; без этого шага первый `POST /detect` часто упирается в
 * `hibernate-rate-limited` на крае площадки.
 */
export async function waitForApiReady(options: WaitForApiReadyOptions = {}): Promise<void> {
  const apiBase = options.apiBase ?? '';
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? defaultSleep;

  const deadline = Date.now() + maxWaitMs;
  const url = joinUrl(apiBase, HEALTH_LIVE_PATH);

  while (Date.now() < deadline) {
    try {
      const response = await fetchFn(url, { method: 'GET' });
      if (response.ok) {
        const body = await readJsonBody(response);
        if (isHealthLiveOk(body)) {
          return;
        }
      } else if (!shouldRetryStatus(response.status)) {
        break;
      }
    } catch {
      // Сеть, прокси или спящий контейнер — повторяем с паузой.
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleepFn(retryIntervalMs);
  }

  throw new Error('API не ответил на /health/live в отведённое время');
}

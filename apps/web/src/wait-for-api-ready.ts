const HEALTH_LIVE_PATH = '/health/live';
/** До ~трёх попыток с длинной паузой: Free Render на 429 hibernate не надо долбить чаще. */
const DEFAULT_MAX_WAIT_MS = 180_000;
/** Пауза после 429/502/503/504 — короткие ретраи только усиливают hibernate-rate-limited. */
const DEFAULT_RETRY_INTERVAL_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function joinUrl(base: string, path: string): string {
  if (base.length === 0) {
    return path;
  }
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Origin, с которого браузер может сам сходить на API (как `curl` к публичному адресу).
 * Docker-имя `http://api:3000` отсюда недоступно — оставляем same-origin прокси.
 */
export function isBrowserReachableApiOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') {
    return true;
  }
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
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

export function resolveHealthLiveUrl(apiBase: string, wakeOrigin: string | undefined): string {
  if (wakeOrigin !== undefined && isBrowserReachableApiOrigin(wakeOrigin)) {
    return joinUrl(wakeOrigin, HEALTH_LIVE_PATH);
  }
  return joinUrl(apiBase, HEALTH_LIVE_PATH);
}

export interface WaitForApiReadyOptions {
  readonly apiBase?: string;
  /**
   * Публичный origin API для пробуждения с браузера (как `curl` к `…-api.onrender.com`).
   * На Render прокси веб→API на спящий инстанс часто сразу получает
   * `x-render-routing: hibernate-rate-limited`; прямой запрос с клиента — тот же путь, что
   * ручной curl. Локальный `http://api:3000` сюда не подходит — см. `isBrowserReachableApiOrigin`.
   */
  readonly wakeOrigin?: string;
  readonly maxWaitMs?: number;
  readonly retryIntervalMs?: number;
  readonly fetchFn?: typeof fetch;
  readonly sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Дожидается ответа `GET /health/live`. На публичном стенде Render предпочтительно бить
 * напрямую в `wakeOrigin` (docs/16-deployment.md §16.2); локально — same-origin через прокси.
 */
export async function waitForApiReady(options: WaitForApiReadyOptions = {}): Promise<void> {
  const apiBase = options.apiBase ?? '';
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? defaultSleep;

  const deadline = Date.now() + maxWaitMs;
  const url = resolveHealthLiveUrl(apiBase, options.wakeOrigin);

  while (Date.now() < deadline) {
    try {
      const response = await fetchFn(url, { method: 'GET', cache: 'no-store' });
      if (response.ok) {
        const body = await readJsonBody(response);
        if (isHealthLiveOk(body)) {
          return;
        }
      } else if (!shouldRetryStatus(response.status)) {
        break;
      }
    } catch {
      // Сеть или спящий контейнер — повторяем с длинной паузой.
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleepFn(retryIntervalMs);
  }

  throw new Error('API не ответил на /health/live в отведённое время');
}

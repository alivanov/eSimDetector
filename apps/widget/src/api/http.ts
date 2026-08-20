import { ApiNetworkError, ApiRequestError, parseApiErrorBody } from './error';

export interface JsonRequestOptions {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * Единая точка сетевого запроса для всех эндпоинтов клиента (`./detect.ts`, `./search.ts`,
 * `./suggest.ts`). Базовый адрес API — параметр, а не константа (ADR-027): `localhost` в код не
 * прошивается, вызывающий код (`apps/web`, будущий Web Component 6.3) передаёт его явно.
 *
 * Отмена запроса через `AbortSignal` (используется ручным поиском для устаревших подсказок,
 * §5 объёма этапа) — не сетевая ошибка, поэтому `AbortError` не заворачивается в `ApiNetworkError`
 * и пробрасывается вызывающему коду как есть: вызывающая сторона сама решает, что делать
 * с отменённым собственным запросом (обычно — молча игнорировать).
 */
export async function requestJson(baseUrl: string, options: JsonRequestOptions): Promise<unknown> {
  const url = joinUrl(baseUrl, options.path);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      ...(options.body !== undefined
        ? {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(options.body),
          }
        : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (isAbortError(cause)) {
      throw cause;
    }
    throw new ApiNetworkError();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const errorBody = parseApiErrorBody(body);
    if (errorBody !== undefined) {
      throw new ApiRequestError(
        errorBody.code,
        errorBody.message,
        response.status,
        errorBody.details,
        errorBody.requestId,
      );
    }
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      `Сервис ответил кодом ${String(response.status)}`,
      response.status,
    );
  }

  return body;
}

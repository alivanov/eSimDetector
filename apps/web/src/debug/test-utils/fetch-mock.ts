/**
 * Подмена `global.fetch` для тестов стенда отладки — тот же приём, что
 * `apps/widget/src/test-utils/fetch-mock.ts` (не импортируется отсюда напрямую: `apps/web` не
 * тянет тестовую инфраструктуру другого приложения, только продуктовый код через `@esim-detector/
 * widget`). Не публичный экспорт `apps/web` и исключён из покрытия (`jest.config.ts` — покрытие
 * здесь и так не собирается, `collectCoverage: false`).
 */
export interface FakeFetchResponseInit {
  readonly status?: number;
  readonly body: unknown;
}

export interface FakeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export function buildFakeResponse({
  status = 200,
  body,
}: FakeFetchResponseInit): FakeFetchResponse {
  const jsonBody = body;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(jsonBody),
    text: () => Promise.resolve(typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody)),
  };
}

export interface FakeFetchInit {
  readonly method?: string;
  readonly body?: string;
}

export type FakeFetch = (
  input: string,
  body: string | undefined,
  init?: FakeFetchInit,
) => Promise<FakeFetchResponse | Response>;

interface FetchInitLike {
  readonly body?: unknown;
  readonly method?: unknown;
}

function isFetchInitLike(value: unknown): value is FetchInitLike {
  return typeof value === 'object' && value !== null;
}

export function installFetchMock(handler: FakeFetch): void {
  Object.defineProperty(globalThis, 'fetch', {
    value: (input: unknown, init: unknown) => {
      const body = isFetchInitLike(init) && typeof init.body === 'string' ? init.body : undefined;
      const method =
        isFetchInitLike(init) && typeof init.method === 'string' ? init.method : undefined;
      return handler(String(input), body, method !== undefined ? { method, body } : { body });
    },
    writable: true,
    configurable: true,
  });
}

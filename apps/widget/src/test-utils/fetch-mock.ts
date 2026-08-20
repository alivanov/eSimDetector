/**
 * Вспомогательные функции для подмены `global.fetch` в тестах компонентов и клиента API. Не
 * является публичным экспортом пакета (`../index.ts` не реэкспортирует этот модуль) и исключён
 * из подсчёта покрытия (`jest.config.ts`, `collectCoverageFrom`) — это тестовая инфраструктура,
 * а не код продукта.
 */

export interface FakeFetchResponseInit {
  readonly status?: number;
  readonly body: unknown;
}

export interface FakeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export function buildFakeResponse({
  status = 200,
  body,
}: FakeFetchResponseInit): FakeFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/**
 * Подменяет `global.fetch` мок-функцией и возвращает её для настройки в тестах
 * (`mock.mockResolvedValueOnce(...)`/`mock.mockRejectedValueOnce(...)`). `Object.defineProperty`
 * со значением, типизированным как `PropertyDescriptor['value']` (`any` по объявлению `lib.dom`),
 * — единственное место подмены глобального `fetch`, не требующее утверждения типа `as`
 * (ADR-016): сигнатура `jest.fn()` заведомо шире строгого типа `typeof fetch`.
 */
export function installFetchMock(): jest.Mock {
  const mock = jest.fn();
  Object.defineProperty(globalThis, 'fetch', { value: mock, writable: true, configurable: true });
  return mock;
}

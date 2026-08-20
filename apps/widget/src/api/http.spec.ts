import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { ApiNetworkError, ApiRequestError } from './error';
import { requestJson } from './http';

describe('requestJson', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('возвращает разобранное тело при успешном ответе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: { ok: true } }));

    const result = await requestJson('http://api.local', { method: 'GET', path: '/x' });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://api.local/x', { method: 'GET' });
  });

  it('сериализует тело POST-запроса и выставляет Content-Type', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: {} }));

    await requestJson('http://api.local', { method: 'POST', path: '/x', body: { q: 'a' } });

    expect(fetchMock).toHaveBeenCalledWith('http://api.local/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ q: 'a' }),
    });
  });

  it('сеть недоступна — fetch отклонён (отдельная ветка от HTTP-ошибок)', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      requestJson('http://api.local', { method: 'GET', path: '/x' }),
    ).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('AbortError пробрасывается как есть, а не заворачивается в ApiNetworkError', async () => {
    const fetchMock = installFetchMock();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    await expect(requestJson('http://api.local', { method: 'GET', path: '/x' })).rejects.toBe(
      abortError,
    );
  });

  it('код ошибки из конверта — 503 CATALOG_UNAVAILABLE', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        status: 503,
        body: {
          error: { code: 'CATALOG_UNAVAILABLE', message: 'ещё запускается', requestId: 'r' },
        },
      }),
    );

    const promise = requestJson('http://api.local', { method: 'GET', path: '/x' });
    await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
    await promise.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiRequestError);
      if (error instanceof ApiRequestError) {
        expect(error.code).toBe('CATALOG_UNAVAILABLE');
        expect(error.httpStatus).toBe(503);
      }
    });
  });

  it('ошибка без разбираемого конверта — INTERNAL_ERROR с кодом статуса в сообщении', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ status: 500, body: 'не json-конверт' }));

    await requestJson('http://api.local', { method: 'GET', path: '/x' }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiRequestError);
      if (error instanceof ApiRequestError) {
        expect(error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  it('тело ответа не является JSON — не бросает при разборе, body становится undefined', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await requestJson('http://api.local', { method: 'GET', path: '/x' });
    expect(result).toBeUndefined();
  });
});

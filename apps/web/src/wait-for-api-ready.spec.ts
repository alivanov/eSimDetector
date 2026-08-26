import { waitForApiReady } from './wait-for-api-ready';

function buildFakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('waitForApiReady', () => {
  it('завершается при первом успешном GET /health/live', async () => {
    const fetchFn = jest.fn().mockResolvedValue(buildFakeResponse(200, { status: 'ok' }));

    await expect(waitForApiReady({ fetchFn, apiBase: '' })).resolves.toBeUndefined();

    expect(fetchFn).toHaveBeenCalledWith('/health/live', { method: 'GET' });
  });

  it('повторяет запрос после 429 и дожидается 200', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(buildFakeResponse(429, {}))
      .mockResolvedValueOnce(buildFakeResponse(200, { status: 'ok' }));
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await waitForApiReady({
      fetchFn,
      sleepFn,
      retryIntervalMs: 1,
      apiBase: 'https://demo.local',
    });

    expect(sleepFn).toHaveBeenCalledWith(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith('https://demo.local/health/live', { method: 'GET' });
  });

  it('бросает ошибку по истечении maxWaitMs', async () => {
    const fetchFn = jest.fn().mockResolvedValue(buildFakeResponse(429, {}));
    const sleepFn = jest.fn().mockResolvedValue(undefined);
    let now = 0;
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 5_000;
      return now;
    });

    await expect(
      waitForApiReady({
        fetchFn,
        sleepFn,
        maxWaitMs: 10_000,
        retryIntervalMs: 1,
      }),
    ).rejects.toThrow('API не ответил на /health/live в отведённое время');

    dateNow.mockRestore();
  });
});

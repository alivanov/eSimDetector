import {
  isBrowserReachableApiOrigin,
  resolveHealthLiveUrl,
  waitForApiReady,
} from './wait-for-api-ready';

function buildFakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('isBrowserReachableApiOrigin', () => {
  it('принимает https и localhost http', () => {
    expect(isBrowserReachableApiOrigin('https://esim-detector-api.onrender.com')).toBe(true);
    expect(isBrowserReachableApiOrigin('http://localhost:3000')).toBe(true);
  });

  it('отклоняет docker-имя api', () => {
    expect(isBrowserReachableApiOrigin('http://api:3000')).toBe(false);
  });
});

describe('resolveHealthLiveUrl', () => {
  it('при публичном wakeOrigin бьёт напрямую в API', () => {
    expect(resolveHealthLiveUrl('', 'https://esim-detector-api.onrender.com')).toBe(
      'https://esim-detector-api.onrender.com/health/live',
    );
  });

  it('при docker wakeOrigin остаётся same-origin', () => {
    expect(resolveHealthLiveUrl('', 'http://api:3000')).toBe('/health/live');
  });
});

describe('waitForApiReady', () => {
  it('завершается при первом успешном GET /health/live', async () => {
    const fetchFn = jest.fn().mockResolvedValue(buildFakeResponse(200, { status: 'ok' }));

    await expect(waitForApiReady({ fetchFn, apiBase: '' })).resolves.toBeUndefined();

    expect(fetchFn).toHaveBeenCalledWith('/health/live', { method: 'GET', cache: 'no-store' });
  });

  it('на Render ходит на публичный wakeOrigin, а не на same-origin прокси', async () => {
    const fetchFn = jest.fn().mockResolvedValue(buildFakeResponse(200, { status: 'ok' }));

    await waitForApiReady({
      fetchFn,
      apiBase: '',
      wakeOrigin: 'https://esim-detector-api.onrender.com',
    });

    expect(fetchFn).toHaveBeenCalledWith('https://esim-detector-api.onrender.com/health/live', {
      method: 'GET',
      cache: 'no-store',
    });
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
      wakeOrigin: 'https://demo.local',
    });

    expect(sleepFn).toHaveBeenCalledWith(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith('https://demo.local/health/live', {
      method: 'GET',
      cache: 'no-store',
    });
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

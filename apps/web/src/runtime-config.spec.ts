import { loadRuntimeConfig } from './runtime-config';

describe('loadRuntimeConfig', () => {
  it('читает apiOrigin из JSON', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ apiOrigin: 'https://esim-detector-api.onrender.com' }),
    });

    await expect(loadRuntimeConfig(fetchFn)).resolves.toEqual({
      apiOrigin: 'https://esim-detector-api.onrender.com',
    });
  });

  it('при отсутствии файла возвращает пустой конфиг', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(loadRuntimeConfig(fetchFn)).resolves.toEqual({ apiOrigin: undefined });
  });
});

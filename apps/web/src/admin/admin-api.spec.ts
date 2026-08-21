import { buildFakeResponse, installFetchMock } from '../debug/test-utils/fetch-mock';

import { getStats, listTasks, reloadCatalog } from './admin-api';

/**
 * Клиент раздела `/admin` (docs/15-moderation.md §15.8) — три показательных ветки: успешный
 * разбор (схема реального ответа сервера), ошибка API (`ApiErrorBody`, переиспользованная из
 * `@esim-detector/widget`) и сетевая ошибка. Полный перебор всех эндпоинтов не требуется — сама
 * функция `request` общая для всех вызовов (`admin-api.ts`).
 */
describe('admin-api', () => {
  it('listTasks разбирает успешный ответ сервера в типизированный результат', async () => {
    installFetchMock((_input, _body) =>
      Promise.resolve(
        buildFakeResponse({
          body: {
            items: [
              {
                _id: 'task-1',
                kind: 'unknown_model_code',
                key: 'sm-s9280',
                payload: { code: 'SM-S9280', platform: 'android', brandGuess: 'samsung' },
                occurrences: 3,
                status: 'open',
                createdAt: '2026-08-20T00:00:00.000Z',
                updatedAt: '2026-08-20T00:00:00.000Z',
                lastSeenAt: '2026-08-20T00:00:00.000Z',
                resolvedAt: null,
                resolvedBy: null,
                resolutionNote: null,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
        }),
      ),
    );

    const outcome = await listTasks('secret-token', { status: 'open' });

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.data.items).toHaveLength(1);
      expect(outcome.data.items[0]?.kind).toBe('unknown_model_code');
      expect(outcome.data.total).toBe(1);
    }
  });

  it('getStats возвращает kind "error" при 401 (неверный/отсутствующий токен, ADR-025 п.5)', async () => {
    installFetchMock(() =>
      Promise.resolve(
        buildFakeResponse({
          status: 401,
          body: {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Раздел модерации недоступен',
              requestId: 'req-1',
            },
          },
        }),
      ),
    );

    const outcome = await getStats('wrong-token');

    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('reloadCatalog возвращает kind "network-error", когда fetch выбрасывает исключение', async () => {
    installFetchMock(() => {
      throw new Error('network down');
    });

    const outcome = await reloadCatalog('secret-token');

    expect(outcome.kind).toBe('network-error');
  });
});

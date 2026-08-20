import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { getCatalogMeta, parseCatalogMeta } from './catalog-meta';
import { ApiParseError } from './error';

const validMeta = { version: 'a1b2c3', deviceCount: 1057, updatedAt: '2026-08-01T00:00:00.000Z' };

describe('parseCatalogMeta', () => {
  it('разбирает полную форму', () => {
    expect(parseCatalogMeta(validMeta)).toEqual(validMeta);
  });

  it('updatedAt может быть null (пустой справочник, docs/06 §6.4)', () => {
    expect(parseCatalogMeta({ ...validMeta, updatedAt: null })?.updatedAt).toBeNull();
  });

  it('неразобранная форма -> undefined', () => {
    expect(parseCatalogMeta({ ...validMeta, deviceCount: 'много' })).toBeUndefined();
    expect(parseCatalogMeta({ ...validMeta, version: '' })).toBeUndefined();
    expect(parseCatalogMeta('x')).toBeUndefined();
  });
});

describe('getCatalogMeta()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отправляет GET /api/v1/catalog/meta', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validMeta }));

    const result = await getCatalogMeta('http://api.local');

    expect(result).toEqual(validMeta);
    const call = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(call[0]).toBe('http://api.local/api/v1/catalog/meta');
    expect(call[1].method).toBe('GET');
  });

  it('бросает ApiParseError при неразбираемом ответе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: {} }));

    await expect(getCatalogMeta('http://api.local')).rejects.toBeInstanceOf(ApiParseError);
  });
});

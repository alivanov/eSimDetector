import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { ApiParseError } from './error';
import { MAX_SUGGEST_LIMIT, parseSuggestResponse, suggestDevices } from './suggest';

const validResponse = {
  requestId: 'r-1',
  query: { raw: 'iph', normalized: 'iph' },
  suggestions: [{ id: 'apple-iphone-13', name: 'iPhone 13', brand: 'Apple' }],
};

describe('parseSuggestResponse', () => {
  it('разбирает полный ответ', () => {
    expect(parseSuggestResponse(validResponse)).toEqual(validResponse);
  });

  it('пустой список подсказок валиден', () => {
    expect(parseSuggestResponse({ ...validResponse, suggestions: [] })?.suggestions).toEqual([]);
  });

  it('неразобранная форма -> undefined', () => {
    expect(parseSuggestResponse({ ...validResponse, suggestions: [{ id: 'a' }] })).toBeUndefined();
    expect(parseSuggestResponse({ ...validResponse, query: 'bad' })).toBeUndefined();
    expect(parseSuggestResponse('x')).toBeUndefined();
  });
});

describe('suggestDevices()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отправляет GET /api/v1/devices/suggest с q и limit', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validResponse }));

    await suggestDevices('http://api.local', 'iph', 5);

    const call = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(call[0]).toBe('http://api.local/api/v1/devices/suggest?q=iph&limit=5');
    expect(call[1].method).toBe('GET');
  });

  it('ограничивает limit значением MAX_SUGGEST_LIMIT, даже если запрошено больше', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validResponse }));

    await suggestDevices('http://api.local', 'iph', 999);

    const call = fetchMock.mock.calls[0] as [string];
    expect(call[0]).toBe(
      `http://api.local/api/v1/devices/suggest?q=iph&limit=${String(MAX_SUGGEST_LIMIT)}`,
    );
  });

  it('бросает ApiParseError при неразбираемом ответе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: {} }));

    await expect(suggestDevices('http://api.local', 'q')).rejects.toBeInstanceOf(ApiParseError);
  });
});

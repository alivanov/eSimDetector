import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { ApiParseError } from './error';
import { parseSearchResponse, searchDevices } from './search';

const validResponse = {
  requestId: 'r-1',
  query: { raw: 'айфон 13 про макс', normalized: 'iphone 13 pro max' },
  status: 'supported',
  confidence: 0.98,
  device: {
    id: 'apple-iphone-13-pro-max',
    brand: 'Apple',
    name: 'iPhone 13 Pro Max',
    esim: { support: 'supported', dualSim: 'physical+esim', maxProfiles: 8 },
  },
  matches: [{ id: 'apple-iphone-13-pro-max', name: 'iPhone 13 Pro Max', score: 0.98 }],
  reasons: [{ code: 'EXACT_ALIAS_MATCH', detail: 'iphone 13 pro max' }],
  presentation: { title: 't', description: 'd', primaryAction: { label: 'l', kind: 'continue' } },
};

describe('parseSearchResponse', () => {
  it('разбирает полный ответ', () => {
    const result = parseSearchResponse(validResponse);
    expect(result?.query).toEqual({ raw: 'айфон 13 про макс', normalized: 'iphone 13 pro max' });
    expect(result?.matches).toHaveLength(1);
  });

  it('device: null -> device undefined', () => {
    expect(parseSearchResponse({ ...validResponse, device: null })?.device).toBeUndefined();
  });

  it('неразобранная форма -> undefined', () => {
    expect(parseSearchResponse({ ...validResponse, query: 'bad' })).toBeUndefined();
    expect(parseSearchResponse({ ...validResponse, matches: 'bad' })).toBeUndefined();
    expect(parseSearchResponse('x')).toBeUndefined();
  });
});

describe('searchDevices()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отправляет POST /api/v1/devices/search с q, без region по умолчанию', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validResponse }));

    await searchDevices('http://api.local', 'iphone 13 pro max');

    const call = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(call[0]).toBe('http://api.local/api/v1/devices/search');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ q: 'iphone 13 pro max' });
  });

  it('region передаётся только явным параметром', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validResponse }));

    await searchDevices('http://api.local', 'iphone 15', 'CN');

    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ q: 'iphone 15', region: 'CN' });
  });

  it('бросает ApiParseError при неразбираемом ответе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: {} }));

    await expect(searchDevices('http://api.local', 'q')).rejects.toBeInstanceOf(ApiParseError);
  });
});

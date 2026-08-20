import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { detect, parseDetectResponse } from './detect';
import { ApiParseError } from './error';

const validSupportedResponse = {
  requestId: 'r-1',
  status: 'supported',
  confidence: 0.97,
  detection: {
    method: 'ua_client_hints_model',
    platform: 'android',
    exactModelKnown: true,
    deviceType: 'phone',
  },
  device: {
    id: 'samsung-galaxy-s24-ultra',
    brand: 'Samsung',
    name: 'Galaxy S24 Ultra',
    esim: { support: 'supported', dualSim: 'physical+esim', maxProfiles: 2 },
  },
  candidates: [],
  reasons: [{ code: 'CATALOG_EXACT_MATCH', detail: 'samsung-galaxy-s24-ultra' }],
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'Galaxy S24 Ultra может использовать eSIM вместе с физической SIM-картой.',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  },
};

describe('parseDetectResponse', () => {
  it('разбирает полный ответ supported', () => {
    const result = parseDetectResponse(validSupportedResponse);
    expect(result?.status).toBe('supported');
    expect(result?.device?.name).toBe('Galaxy S24 Ultra');
    expect(result?.clarification).toBeUndefined();
  });

  it('device: null -> device undefined в результате (группа/не определено)', () => {
    const result = parseDetectResponse({ ...validSupportedResponse, device: null, candidates: [] });
    expect(result?.device).toBeUndefined();
  });

  it('блок clarification отсутствует -> undefined, а не null', () => {
    const result = parseDetectResponse(validSupportedResponse);
    expect(result).toBeDefined();
    expect('clarification' in (result ?? {})).toBe(true);
    expect(result?.clarification).toBeUndefined();
  });

  it('разбирает clarification_required с choose_candidate', () => {
    const response = {
      ...validSupportedResponse,
      status: 'clarification_required',
      device: null,
      candidates: [{ id: 'apple-iphone-x', name: 'iPhone X', esimSupport: 'not_supported' }],
      clarification: {
        kind: 'choose_candidate',
        question: 'Уточните модель вашего iPhone',
        options: [
          { id: 'apple-iphone-x', label: 'iPhone X' },
          { id: '__other__', label: 'Другая модель' },
        ],
      },
    };
    const result = parseDetectResponse(response);
    expect(result?.clarification?.kind).toBe('choose_candidate');
    expect(result?.clarification?.options).toHaveLength(2);
  });

  it('неразобранная форма -> undefined', () => {
    expect(parseDetectResponse('x')).toBeUndefined();
    expect(parseDetectResponse({ ...validSupportedResponse, status: 'bogus' })).toBeUndefined();
    expect(
      parseDetectResponse({ ...validSupportedResponse, detection: undefined }),
    ).toBeUndefined();
    expect(
      parseDetectResponse({ ...validSupportedResponse, presentation: undefined }),
    ).toBeUndefined();
    expect(
      parseDetectResponse({ ...validSupportedResponse, clarification: { kind: 'nope' } }),
    ).toBeUndefined();
  });
});

describe('detect()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отправляет POST /api/v1/detect и возвращает разобранный ответ', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validSupportedResponse }));

    const result = await detect('http://api.local', { signals: {} });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/api/v1/detect',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe('supported');
  });

  it('тело первого запроса не содержит context.region, если region не передан', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: validSupportedResponse }));

    await detect('http://api.local', { signals: {}, context: { channel: 'web-lk' } });

    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    const sentBody = JSON.parse(call[1].body) as { context?: { region?: string } };
    expect(sentBody.context?.region).toBeUndefined();
  });

  it('бросает ApiParseError при неразбираемом ответе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: { not: 'a detect response' } }));

    await expect(detect('http://api.local', {})).rejects.toBeInstanceOf(ApiParseError);
  });
});

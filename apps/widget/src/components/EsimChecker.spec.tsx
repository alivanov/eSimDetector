import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { isRecord } from '../api/predicates';
import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { EsimChecker } from './EsimChecker';

const API_BASE = 'http://api.local';

const supportedResponse = {
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
  reasons: [{ code: 'CATALOG_EXACT_MATCH' }],
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'Samsung Galaxy S24 Ultra может использовать eSIM вместе с физической SIM-картой.',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  },
};

const notSupportedResponse = {
  requestId: 'r-2',
  status: 'not_supported',
  confidence: 0.9,
  detection: {
    method: 'ua_client_hints_model',
    platform: 'android',
    exactModelKnown: true,
    deviceType: 'phone',
  },
  device: {
    id: 'apple-iphone-x',
    brand: 'Apple',
    name: 'iPhone X',
    esim: { support: 'not_supported', dualSim: 'none', maxProfiles: null },
  },
  candidates: [],
  reasons: [{ code: 'CATALOG_EXACT_MATCH' }],
  presentation: {
    title: 'Ваше устройство не поддерживает eSIM',
    description: 'iPhone X не поддерживает технологию eSIM.',
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  },
};

const iosGroupSupportedResponse = {
  requestId: 'r-3',
  status: 'supported',
  confidence: 0.93,
  detection: {
    method: 'ios_version_and_screen_signature',
    platform: 'ios',
    exactModelKnown: false,
    deviceType: 'phone',
  },
  device: null,
  candidates: [
    { id: 'apple-iphone-14-pro', name: 'iPhone 14 Pro' },
    { id: 'apple-iphone-15', name: 'iPhone 15' },
  ],
  reasons: [{ code: 'CANDIDATES_AGREE_ON_ESIM' }],
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'Мы определили, что у вас iPhone одной из моделей, поддерживающих eSIM.',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
    secondaryAction: { label: 'Уточнить модель', kind: 'clarify' },
  },
};

const chooseCandidateResponse = {
  requestId: 'r-4',
  status: 'clarification_required',
  confidence: 0.41,
  detection: {
    method: 'ios_version_and_screen_signature',
    platform: 'ios',
    exactModelKnown: false,
    deviceType: 'phone',
  },
  device: null,
  candidates: [
    { id: 'apple-iphone-x', name: 'iPhone X', esimSupport: 'not_supported' },
    { id: 'apple-iphone-xs', name: 'iPhone XS', esimSupport: 'supported' },
  ],
  reasons: [{ code: 'CANDIDATES_DISAGREE_ON_ESIM' }],
  clarification: {
    kind: 'choose_candidate',
    question: 'Уточните модель вашего iPhone',
    options: [
      { id: 'apple-iphone-x', label: 'iPhone X' },
      { id: 'apple-iphone-xs', label: 'iPhone XS' },
      { id: '__other__', label: 'Другая модель' },
    ],
  },
  presentation: {
    title: 'Нужно уточнить модель устройства',
    description: 'Несколько моделей iPhone выглядят для браузера одинаково. Выберите вашу.',
    primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
  },
};

const answerQuestionResponse = {
  requestId: 'r-5',
  status: 'clarification_required',
  confidence: 0.4,
  detection: {
    method: 'ios_version_and_screen_signature',
    platform: 'ios',
    exactModelKnown: false,
    deviceType: 'phone',
  },
  device: null,
  candidates: [
    { id: 'apple-iphone-14-pro', name: 'iPhone 14 Pro' },
    { id: 'apple-iphone-15', name: 'iPhone 15' },
  ],
  reasons: [{ code: 'CANDIDATES_DISAGREE_ON_ESIM' }],
  clarification: {
    kind: 'answer_question',
    question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
    options: [
      { id: 'CN', label: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)' },
      { id: 'OTHER', label: 'Одну nano-SIM (все остальные версии)' },
    ],
  },
  presentation: {
    title: 'Нужно уточнить модель устройства',
    description: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
    primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
  },
};

const searchSupportedResponse = {
  requestId: 'r-6',
  query: { raw: 'iPhone XS', normalized: 'iphone xs' },
  status: 'supported',
  confidence: 0.98,
  device: {
    id: 'apple-iphone-xs',
    brand: 'Apple',
    name: 'iPhone XS',
    esim: { support: 'supported', dualSim: 'physical+esim', maxProfiles: 8 },
  },
  matches: [{ id: 'apple-iphone-xs', name: 'iPhone XS', score: 1 }],
  reasons: [{ code: 'EXACT_ALIAS_MATCH' }],
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'iPhone XS может использовать eSIM вместе с физической SIM-картой.',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  },
};

function parsedBody(fetchMock: jest.Mock, callIndex: number): Record<string, unknown> {
  const call = fetchMock.mock.calls[callIndex] as [string, { body?: string }];
  const parsed: unknown = JSON.parse(call[1].body ?? '{}');
  if (!isRecord(parsed)) {
    throw new Error('ожидался объект в теле запроса');
  }
  return parsed;
}

function callUrl(fetchMock: jest.Mock, callIndex: number): string {
  const call = fetchMock.mock.calls[callIndex] as [string];
  return call[0];
}

describe('EsimChecker — три статуса результата', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('supported: показывает заголовок, пояснение и оба действия', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByRole('heading', { name: 'Ваше устройство поддерживает eSIM' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подключить eSIM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Это не моё устройство' })).toBeInTheDocument();
  });

  it('not_supported: primaryAction отсутствует', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: notSupportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByRole('heading', { name: 'Ваше устройство не поддерживает eSIM' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подключить eSIM' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Это не моё устройство' })).toBeInTheDocument();
  });

  it('clarification_required: показывает заголовок и интерактивное уточнение сразу, без дополнительного клика', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: chooseCandidateResponse }));

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByRole('heading', { name: 'Нужно уточнить модель устройства' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'iPhone X' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'iPhone XS' })).toBeInTheDocument();
  });

  it('onResult вызывается с итоговым статусом, deviceId, confidence, exactModelKnown', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    const onResult = jest.fn();

    render(<EsimChecker apiBase={API_BASE} onResult={onResult} />);

    await screen.findByRole('heading', { name: 'Ваше устройство поддерживает eSIM' });
    expect(onResult).toHaveBeenCalledWith({
      status: 'supported',
      deviceId: 'samsung-galaxy-s24-ultra',
      confidence: 0.97,
      exactModelKnown: true,
    });
  });

  it('клик по действию kind: continue вызывает onPrimaryAction, а не встроенную логику', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    const onPrimaryAction = jest.fn();

    render(<EsimChecker apiBase={API_BASE} onPrimaryAction={onPrimaryAction} />);
    await screen.findByRole('button', { name: 'Подключить eSIM' });
    fireEvent.click(screen.getByRole('button', { name: 'Подключить eSIM' }));

    expect(onPrimaryAction).toHaveBeenCalledWith({ label: 'Подключить eSIM', kind: 'continue' });
  });
});

describe('EsimChecker — context.region только по клику пользователя (docs/06 §6.2, ADR-003, ADR-031)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('первый запрос /detect уходит БЕЗ context.region, второй — с ним и с теми же signals', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: answerQuestionResponse }));
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));

    render(<EsimChecker apiBase={API_BASE} channel="web-lk" />);

    await screen.findByRole('button', {
      name: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)',
    });

    const firstBody = parsedBody(fetchMock, 0);
    expect(firstBody).not.toHaveProperty('context.region');
    expect(
      (firstBody['context'] as Record<string, unknown> | undefined)?.['region'],
    ).toBeUndefined();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)',
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(callUrl(fetchMock, 1)).toBe(`${API_BASE}/api/v1/detect`);

    const secondBody = parsedBody(fetchMock, 1);
    expect((secondBody['context'] as Record<string, unknown>)['region']).toBe('CN');
    expect(secondBody['signals']).toEqual(firstBody['signals']);
  });
});

describe('EsimChecker — сценарий уточнения choose_candidate (ADR-039)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('клик по варианту отправляет POST /devices/search с q, равным его подписи', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: chooseCandidateResponse }));
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: searchSupportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('button', { name: 'iPhone XS' });

    fireEvent.click(screen.getByRole('button', { name: 'iPhone XS' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(callUrl(fetchMock, 1)).toBe(`${API_BASE}/api/v1/devices/search`);
    expect(parsedBody(fetchMock, 1)).toEqual({ q: 'iPhone XS' });

    expect(
      await screen.findByText('iPhone XS может использовать eSIM вместе с физической SIM-картой.'),
    ).toBeInTheDocument();
  });

  it('клик по «Другая модель» (__other__) уводит в ручной поиск без запроса к серверу', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: chooseCandidateResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('button', { name: 'Другая модель' });
    fireEvent.click(screen.getByRole('button', { name: 'Другая модель' }));

    expect(await screen.findByRole('button', { name: 'Найти' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('группа iOS с определённым статусом: «Уточнить модель» раскрывает список кандидатов + «Другая модель»', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: iosGroupSupportedResponse }));
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: searchSupportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('button', { name: 'Уточнить модель' });

    expect(screen.queryByRole('button', { name: 'iPhone 14 Pro' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Уточнить модель' }));

    expect(screen.getByRole('button', { name: 'iPhone 14 Pro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Другая модель' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'iPhone 14 Pro' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(parsedBody(fetchMock, 1)).toEqual({ q: 'iPhone 14 Pro' });
  });
});

describe('EsimChecker — ветки ошибок (docs/13-branding.md §13.6 «Ошибки взаимодействия»)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('сеть недоступна: fetch отклонён — показывается отдельный текст сетевой ошибки', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByText(
        'Не удалось связаться с сервисом. Проверьте подключение и повторите попытку.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('503 CATALOG_UNAVAILABLE — показывается текст «сервис ещё запускается», не как сбой определения', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        status: 503,
        body: { error: { code: 'CATALOG_UNAVAILABLE', message: 'm', requestId: 'r' } },
      }),
    );

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByText('Сервис ещё запускается. Повторите попытку через несколько секунд.'),
    ).toBeInTheDocument();
  });

  it('429 RATE_LIMITED — показывается текст про частоту запросов', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'm', requestId: 'r' } },
      }),
    );

    render(<EsimChecker apiBase={API_BASE} />);

    expect(
      await screen.findByText('Слишком много запросов. Повторите попытку через минуту.'),
    ).toBeInTheDocument();
  });

  it('кнопка «Повторить» повторяет запрос и восстанавливает результат при успехе', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('button', { name: 'Повторить' });

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(
      await screen.findByRole('heading', { name: 'Ваше устройство поддерживает eSIM' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('EsimChecker — answer_question для результата /devices/search (регрессия сквозного прогона)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('после поиска по названию ответ на региональный вопрос уходит ПОВТОРНЫМ /devices/search с тем же q, а не /detect', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        body: {
          requestId: 'r-search-1',
          query: { raw: 'iPhone 13', normalized: 'iphone 13' },
          status: 'clarification_required',
          confidence: 0.4,
          device: null,
          matches: [{ id: 'apple-iphone-13', name: 'iPhone 13', score: 1 }],
          reasons: [{ code: 'CANDIDATES_DISAGREE_ON_ESIM' }],
          clarification: answerQuestionResponse.clarification,
          presentation: answerQuestionResponse.presentation,
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: searchSupportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('button', { name: 'Указать устройство вручную' });

    fireEvent.click(screen.getByRole('button', { name: 'Указать устройство вручную' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Название устройства' }), {
      target: { value: 'iPhone 13' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));

    await screen.findByRole('button', {
      name: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)',
    });
    expect(callUrl(fetchMock, 1)).toBe(`${API_BASE}/api/v1/devices/search`);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)',
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(callUrl(fetchMock, 2)).toBe(`${API_BASE}/api/v1/devices/search`);
    expect(parsedBody(fetchMock, 2)).toEqual({ q: 'iPhone 13', region: 'CN' });
  });
});

describe('EsimChecker — переход к ручному поиску', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ссылка «Указать устройство вручную» доступна на экране результата', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: searchSupportedResponse }));

    render(<EsimChecker apiBase={API_BASE} />);
    await screen.findByRole('heading', { name: 'Ваше устройство поддерживает eSIM' });

    fireEvent.click(screen.getByRole('button', { name: 'Указать устройство вручную' }));
    expect(screen.getByRole('button', { name: 'Найти' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Название устройства' }), {
      target: { value: 'iPhone XS' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));

    expect(
      await screen.findByText('iPhone XS может использовать eSIM вместе с физической SIM-картой.'),
    ).toBeInTheDocument();
    expect(callUrl(fetchMock, 1)).toBe(`${API_BASE}/api/v1/devices/search`);
  });
});

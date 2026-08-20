import { fireEvent, waitFor } from '@testing-library/react';

import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import {
  ESIM_WIDGET_TAG_NAME,
  EsimDetectorWidgetElement,
  registerEsimDetectorWidgetElement,
} from './esim-detector-widget-element';
import type { EsimActionEventDetail, EsimWidgetEventMap } from './events';
import { ESIM_WIDGET_EVENT_TYPES } from './events';
import {
  installImmediateIntersectionObserverMock,
  removeIntersectionObserverMock,
} from './test-utils/intersection-observer-mock';

// `apiBase` — адрес БЕЗ версионированного пути (та же граница, что `EsimCheckerProps.apiBase`,
// docs/06-api-contract.md §6.1): клиент API (`detect.ts`/`search.ts`/`suggest.ts`) сам добавляет
// `/api/v1/...` к каждому запросу.
const API_BASE = 'https://esim-detector.example.ru';

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

const clarificationResponse = {
  requestId: 'r-2',
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

function createElementInContainer(): {
  container: HTMLElement;
  element: EsimDetectorWidgetElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  registerEsimDetectorWidgetElement();
  const element = document.createElement(ESIM_WIDGET_TAG_NAME);
  if (!(element instanceof EsimDetectorWidgetElement)) {
    throw new Error('Пользовательский элемент не зарегистрирован ожидаемым классом');
  }
  container.appendChild(element);
  return { container, element };
}

function waitForEvent<K extends keyof EsimWidgetEventMap>(
  target: EventTarget,
  type: K,
): Promise<EsimWidgetEventMap[K]> {
  return new Promise((resolve) => {
    target.addEventListener(
      type,
      (event) => {
        if (event instanceof CustomEvent) {
          resolve(event.detail as EsimWidgetEventMap[K]);
        }
      },
      { once: true },
    );
  });
}

describe('EsimDetectorWidgetElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    removeIntersectionObserverMock();
  });

  it('регистрирует пользовательский элемент под ожидаемым именем', () => {
    registerEsimDetectorWidgetElement();
    expect(customElements.get(ESIM_WIDGET_TAG_NAME)).toBe(EsimDetectorWidgetElement);
  });

  it('повторная регистрация не бросает исключение', () => {
    expect(() => {
      registerEsimDetectorWidgetElement();
      registerEsimDetectorWidgetElement();
    }).not.toThrow();
  });

  it('создаёт теневой корень со стилем токенов и точкой монтирования', () => {
    installFetchMock();
    const { element } = createElementInContainer();

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.querySelector('#esim-detector-design-tokens')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('[data-esim-widget-mount]')).not.toBeNull();
  });

  it('стиль токенов не попадает в document.head хост-страницы (взаимная изоляция)', () => {
    installFetchMock();
    createElementInContainer();

    expect(document.head.querySelector('#esim-detector-design-tokens')).toBeNull();
  });

  it('публикует esim:ready сразу при подключении, до завершения автоопределения', () => {
    const fetchMock = installFetchMock();
    // Не резолвим ответ вовсе — важно, что esim:ready не ждёт результата сети.
    fetchMock.mockReturnValue(new Promise(() => {}));
    const container = document.createElement('div');
    document.body.appendChild(container);
    registerEsimDetectorWidgetElement();
    const element = document.createElement(ESIM_WIDGET_TAG_NAME);

    let readyDetail: unknown;
    element.addEventListener('esim:ready', (event) => {
      if (event instanceof CustomEvent) {
        readyDetail = event.detail;
      }
    });
    element.setAttribute('data-channel', 'landing-esim');
    container.appendChild(element);

    expect(readyDetail).toEqual({ channel: 'landing-esim' });
  });

  it('читает data-theme/data-channel/data-api-base и монтируется по IntersectionObserver', async () => {
    installImmediateIntersectionObserverMock();
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    registerEsimDetectorWidgetElement();
    const element = document.createElement(ESIM_WIDGET_TAG_NAME);
    if (!(element instanceof EsimDetectorWidgetElement)) {
      throw new Error('Пользовательский элемент не зарегистрирован ожидаемым классом');
    }
    // Атрибуты выставляются ДО подключения к документу: `connectedCallback` (монтирование через
    // `IntersectionObserver`) читает их синхронно при появлении в DOM, а не позже.
    element.setAttribute('data-theme', 'sbermobile');
    element.setAttribute('data-channel', 'landing-esim');
    element.setAttribute('data-api-base', API_BASE);
    container.appendChild(element);

    expect(element.theme).toBe('sbermobile');
    expect(element.channel).toBe('landing-esim');
    expect(element.apiBaseAttribute).toBe(API_BASE);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe(`${API_BASE}/api/v1/detect`);
  });

  it('без data-api-base запрос уходит по относительному пути, не бросая исключение', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));

    createElementInContainer();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe('/api/v1/detect');
  });

  it('публикует esim:detected и esim:result при автоопределении', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    registerEsimDetectorWidgetElement();
    const element = document.createElement(ESIM_WIDGET_TAG_NAME);
    // Оба события публикуются СИНХРОННО одно за другим внутри `applyDetectResult` (сначала
    // `esim:detected`, затем `esim:result`) — оба слушателя должны быть навешаны ДО подключения
    // элемента к документу (которое запускает монтирование и, в конце цепочки, оба события),
    // иначе второй `waitForEvent`, вызванный уже ПОСЛЕ разрешения первого, пропустит `esim:result`:
    // к этому моменту событие уже произошло в том же синхронном участке кода.
    const detectedPromise = waitForEvent(element, 'esim:detected');
    const resultPromise = waitForEvent(element, 'esim:result');
    container.appendChild(element);

    const detected = await detectedPromise;
    expect(detected).toEqual({
      method: 'ua_client_hints_model',
      platform: 'android',
      deviceType: 'phone',
      exactModelKnown: true,
    });

    const result = await resultPromise;
    expect(result).toEqual({
      status: 'supported',
      deviceId: 'samsung-galaxy-s24-ultra',
      confidence: 0.97,
      exactModelKnown: true,
    });
  });

  it('esim:detected не публикуется повторно для результата ручного поиска', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        body: {
          requestId: 'r-search-1',
          query: { raw: 'iPhone 13', normalized: 'iphone 13' },
          status: 'supported',
          confidence: 0.95,
          device: { ...supportedResponse.device, id: 'apple-iphone-13' },
          matches: [{ id: 'apple-iphone-13', name: 'iPhone 13', score: 1 }],
          reasons: [{ code: 'CATALOG_EXACT_MATCH' }],
          presentation: supportedResponse.presentation,
        },
      }),
    );
    const { element } = createElementInContainer();

    let detectedCount = 0;
    element.addEventListener('esim:detected', () => {
      detectedCount += 1;
    });

    await waitForEvent(element, 'esim:result');
    expect(detectedCount).toBe(1);

    const buttons = () => Array.from(element.shadowRoot?.querySelectorAll('button') ?? []);
    // Событие `esim:result` публикуется ДО того, как React фиксирует обновлённое дерево DOM
    // (диспетчеризация происходит внутри обработчика `onResult`, синхронно перед `setScreen`,
    // а сам коммит React планируется отдельно) — поэтому дальнейшие запросы к разметке дожидаются
    // её появления через `waitFor`, а не читают DOM немедленно после `await` события.
    const manualLink = await waitFor(() => {
      const found = buttons().find(
        (candidate) => candidate.textContent === 'Указать устройство вручную',
      );
      if (found === undefined) {
        throw new Error('Ссылка «Указать устройство вручную» пока не отрисована');
      }
      return found;
    });
    fireEvent.click(manualLink);

    const input = await waitFor(() => {
      const found = element.shadowRoot?.querySelector('input');
      if (found === null || found === undefined) {
        throw new Error('Поле ручного поиска пока не отрисовано');
      }
      return found;
    });
    fireEvent.change(input, { target: { value: 'iPhone 13' } });
    const searchButton = await waitFor(() => {
      const found = buttons().find((candidate) => candidate.textContent === 'Найти');
      if (found === undefined) {
        throw new Error('Кнопка «Найти» пока не отрисована');
      }
      return found;
    });

    const secondResult = waitForEvent(element, 'esim:result');
    fireEvent.click(searchButton);
    await secondResult;

    expect(detectedCount).toBe(1);
  });

  it('публикует esim:clarification с формой { kind, question, options }', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: clarificationResponse }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    registerEsimDetectorWidgetElement();
    const element = document.createElement(ESIM_WIDGET_TAG_NAME);
    // См. комментарий в тесте выше про `esim:detected`/`esim:result` — `esim:clarification`
    // публикуется синхронно перед `esim:result` в том же вызове, поэтому оба слушателя
    // навешиваются заранее.
    const clarificationPromise = waitForEvent(element, 'esim:clarification');
    const resultPromise = waitForEvent(element, 'esim:result');
    container.appendChild(element);

    const clarification = await clarificationPromise;
    expect(clarification).toEqual({
      kind: 'choose_candidate',
      question: 'Уточните модель вашего iPhone',
      options: [
        { id: 'apple-iphone-x', label: 'iPhone X' },
        { id: 'apple-iphone-xs', label: 'iPhone XS' },
        { id: '__other__', label: 'Другая модель' },
      ],
    });

    const result = await resultPromise;
    expect(result.status).toBe('clarification_required');
  });

  it('публикует esim:error при сетевом сбое', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { element } = createElementInContainer();

    const error = await waitForEvent(element, 'esim:error');
    expect(error.code).toBe('NETWORK');
    expect(typeof error.message).toBe('string');
  });

  it('esim:action публикуется по клику на действие continue, с deviceId/status/confidence из результата', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(buildFakeResponse({ body: supportedResponse }));
    const { element } = createElementInContainer();

    await waitForEvent(element, 'esim:result');

    // См. комментарий в тесте про ручной поиск выше: DOM обновляется отдельно от диспетчеризации
    // `esim:result`, поэтому кнопка ищется через `waitFor`, а не сразу после `await` события.
    const button = await waitFor(() => {
      const found = Array.from(element.shadowRoot?.querySelectorAll('button') ?? []).find(
        (candidate) => candidate.textContent === 'Подключить eSIM',
      );
      if (found === undefined) {
        throw new Error('Кнопка «Подключить eSIM» пока не отрисована');
      }
      return found;
    });

    const actionPromise = waitForEvent(element, 'esim:action');
    fireEvent.click(button);
    const action: EsimActionEventDetail = await actionPromise;

    expect(action).toEqual({
      kind: 'continue',
      label: 'Подключить eSIM',
      deviceId: 'samsung-galaxy-s24-ultra',
      status: 'supported',
      confidence: 0.97,
    });
  });

  it('все шесть событий из ESIM_WIDGET_EVENT_TYPES публикуются с composed: true (проверка на esim:ready)', () => {
    installFetchMock();
    const container = document.createElement('div');
    document.body.appendChild(container);
    registerEsimDetectorWidgetElement();
    const element = document.createElement(ESIM_WIDGET_TAG_NAME);

    let composedFlag: boolean | undefined;
    for (const type of ESIM_WIDGET_EVENT_TYPES) {
      element.addEventListener(type, (event) => {
        if (type === 'esim:ready') {
          composedFlag = event.composed;
        }
      });
    }
    container.appendChild(element);

    expect(composedFlag).toBe(true);
  });

  it('disconnectedCallback размонтирует React-дерево и отключает наблюдатель без исключений', () => {
    installFetchMock();
    installImmediateIntersectionObserverMock();
    const { element, container } = createElementInContainer();

    expect(() => {
      container.removeChild(element);
    }).not.toThrow();
  });
});

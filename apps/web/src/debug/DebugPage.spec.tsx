import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DebugPage } from './DebugPage';
import { buildFakeResponse, installFetchMock } from './test-utils/fetch-mock';
import { debugAuxTexts, debugTexts } from './texts';

function textareaValue(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  throw new Error('Ожидался <textarea>');
}

const catalogMeta = { version: 'abc123', deviceCount: 1057, updatedAt: '2026-08-01T00:00:00.000Z' };

const clarificationResponse = {
  requestId: 'r-region',
  status: 'clarification_required',
  confidence: 0.4,
  detection: {
    method: 'ios_version_and_screen_signature',
    platform: 'ios',
    exactModelKnown: false,
    deviceType: 'phone',
  },
  device: null,
  candidates: [{ id: 'apple-iphone-14', name: 'iPhone 14' }],
  reasons: [{ code: 'SCREEN_SIGNATURE_MATCHED', detail: '390x844@3' }],
  clarification: {
    kind: 'answer_question',
    question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
    options: [
      { id: 'CN', label: 'Две nano-SIM' },
      { id: 'OTHER', label: 'Одну nano-SIM' },
    ],
  },
  presentation: {
    title: 'Нужно уточнить модель устройства',
    description: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
    primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
  },
};

const resolvedResponse = {
  requestId: 'r-resolved',
  status: 'supported',
  confidence: 0.9,
  detection: {
    method: 'ios_version_and_screen_signature',
    platform: 'ios',
    exactModelKnown: false,
    deviceType: 'phone',
  },
  device: null,
  candidates: [{ id: 'apple-iphone-14', name: 'iPhone 14' }],
  reasons: [{ code: 'ESIM_CONDITION_MATCHED_REGION', detail: 'OTHER' }],
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'Мы определили, что у вас iPhone одной из моделей, поддерживающих eSIM.',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
  },
};

function setupFetch(): void {
  installFetchMock((url, body) => {
    if (url.endsWith('/api/v1/catalog/meta')) {
      return Promise.resolve(buildFakeResponse({ body: catalogMeta }));
    }
    if (url.endsWith('/api/v1/detect')) {
      const parsedBody: unknown = body !== undefined ? JSON.parse(body) : undefined;
      const hasRegion =
        typeof parsedBody === 'object' &&
        parsedBody !== null &&
        'context' in parsedBody &&
        typeof (parsedBody as { context?: unknown }).context === 'object' &&
        (parsedBody as { context?: { region?: unknown } }).context?.region !== undefined;
      return Promise.resolve(
        buildFakeResponse({ body: hasRegion ? resolvedResponse : clarificationResponse }),
      );
    }
    return Promise.resolve(buildFakeResponse({ status: 404, body: {} }));
  });
}

describe('DebugPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('показывает заголовок и версию справочника из GET /catalog/meta', async () => {
    setupFetch();
    render(<DebugPage />);

    expect(screen.getByRole('heading', { name: debugTexts.pageTitle })).toBeInTheDocument();
    expect(await screen.findByText(/abc123/)).toBeInTheDocument();
  });

  it('отправляет собранные сигналы и показывает полный ответ сервиса с уточнением', async () => {
    setupFetch();
    render(<DebugPage />);

    await waitFor(() => {
      const textarea = screen.getByLabelText(debugTexts.signalsFieldLabel);
      expect(textareaValue(textarea)).toContain('{');
    });

    fireEvent.click(screen.getByRole('button', { name: debugTexts.submitButton }));

    expect(await screen.findByText(/clarification_required/)).toBeInTheDocument();
    const responseSection = screen.getByLabelText(debugTexts.responseBlockTitle);
    expect(
      within(responseSection).getByText(
        'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('SCREEN_SIGNATURE_MATCHED')).toBeInTheDocument();
  });

  it('ответ на вопрос уточнения уходит только по явному клику и разрешает статус', async () => {
    setupFetch();
    render(<DebugPage />);

    await waitFor(() => {
      expect(textareaValue(screen.getByLabelText(debugTexts.signalsFieldLabel))).toContain('{');
    });

    fireEvent.click(screen.getByRole('button', { name: debugTexts.submitButton }));
    await screen.findByText(/clarification_required/);

    fireEvent.click(screen.getByRole('button', { name: 'Одну nano-SIM' }));

    expect(await screen.findByText(`${debugAuxTexts.statusLabel}: supported`)).toBeInTheDocument();
    expect(screen.getByText('ESIM_CONDITION_MATCHED_REGION')).toBeInTheDocument();
  });

  it('некорректный JSON в поле сигналов даёт понятную ошибку разбора без запроса', async () => {
    setupFetch();
    render(<DebugPage />);

    const textarea = screen.getByLabelText(debugTexts.signalsFieldLabel);
    fireEvent.change(textarea, { target: { value: '{ не json' } });
    fireEvent.click(screen.getByRole('button', { name: debugTexts.submitButton }));

    expect(await screen.findByText(debugTexts.jsonParseError)).toBeInTheDocument();
    const responseSection = screen.getByLabelText(debugTexts.responseBlockTitle);
    expect(within(responseSection).getByText(debugAuxTexts.noResponseYet)).toBeInTheDocument();
  });

  it('кнопка «Собрать сигналы этого браузера заново» перезаписывает поле', async () => {
    setupFetch();
    render(<DebugPage />);

    const textarea = screen.getByLabelText(debugTexts.signalsFieldLabel);
    await waitFor(() => {
      expect(textareaValue(textarea)).toContain('{');
    });

    fireEvent.change(textarea, { target: { value: 'испорчено' } });
    fireEvent.click(screen.getByRole('button', { name: debugTexts.recollectButton }));

    await waitFor(() => {
      expect(textareaValue(textarea)).toContain('{');
    });
  });
});

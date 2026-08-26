import { fireEvent, render, screen } from '@testing-library/react';

import { App } from './App';
import { homeFeedbackTexts, homeWakeTexts } from './homeTexts';
import { waitForApiReady } from './wait-for-api-ready';

jest.mock('./runtime-config', () => ({
  loadRuntimeConfig: jest.fn().mockResolvedValue({ apiOrigin: undefined }),
}));

jest.mock('./wait-for-api-ready');

const waitForApiReadyMock = jest.mocked(waitForApiReady);

describe('App', () => {
  beforeEach(() => {
    waitForApiReadyMock.mockReset();
    waitForApiReadyMock.mockResolvedValue(undefined);
  });

  it('подключает EsimChecker (docs/02-architecture.md §2.1) без собственной бизнес-логики', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Проверка поддержки eSIM' }),
    ).toBeInTheDocument();
  });

  it('скрывает «Хочу улучшить приложение», пока API просыпается', async () => {
    let resolveWake: (() => void) | undefined;
    waitForApiReadyMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWake = () => {
            resolve();
          };
        }),
    );

    render(<App />);

    expect(await screen.findByText(homeWakeTexts.loading)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: homeFeedbackTexts.toggle }),
    ).not.toBeInTheDocument();

    resolveWake?.();
    expect(
      await screen.findByRole('button', { name: homeFeedbackTexts.toggle }),
    ).toBeInTheDocument();
  });

  it('скрывает «Хочу улучшить приложение» при недоступности и показывает «Повторить»', async () => {
    waitForApiReadyMock.mockRejectedValueOnce(new Error('timeout'));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(homeWakeTexts.failed);
    expect(screen.getByRole('button', { name: homeWakeTexts.retry })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: homeFeedbackTexts.toggle }),
    ).not.toBeInTheDocument();
  });

  it('аккордеон «Хочу улучшить приложение» раскрывает шаги со ссылкой /debug', async () => {
    render(<App />);
    const toggle = await screen.findByRole('button', { name: homeFeedbackTexts.toggle });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('link', { name: homeFeedbackTexts.debugLinkLabel }),
    ).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const debugLink = screen.getByRole('link', { name: homeFeedbackTexts.debugLinkLabel });
    expect(debugLink).toHaveAttribute('href', '/debug');
    expect(screen.getByText(/Скриншот экрана результата/)).toBeInTheDocument();
    expect(screen.getByText(/ivanov@intspirit.com/)).toBeInTheDocument();
  });
});

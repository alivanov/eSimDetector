import { fireEvent, render, screen } from '@testing-library/react';

import { App } from './App';
import { homeFeedbackTexts } from './homeTexts';

jest.mock('./wait-for-api-ready', () => ({
  waitForApiReady: jest.fn().mockResolvedValue(undefined),
}));

describe('App', () => {
  it('подключает EsimChecker (docs/02-architecture.md §2.1) без собственной бизнес-логики', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Проверка поддержки eSIM' }),
    ).toBeInTheDocument();
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

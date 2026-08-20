import { render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  it('подключает EsimChecker (docs/02-architecture.md §2.1) без собственной бизнес-логики', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Проверка поддержки eSIM' }),
    ).toBeInTheDocument();
  });
});

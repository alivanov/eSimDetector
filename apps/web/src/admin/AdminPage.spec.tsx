import { render, screen } from '@testing-library/react';

import { AdminPage } from './AdminPage';
import { adminTexts } from './texts';

describe('AdminPage', () => {
  it('показывает форму входа по токену, пока сессия не установлена (docs/15 §15.7, ADR-025 п.5)', () => {
    render(<AdminPage />);

    expect(screen.getByLabelText(adminTexts.tokenLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminTexts.loginButton })).toBeInTheDocument();
    // Раздел не показывает очередь задач до успешной проверки токена реальным запросом.
    expect(screen.queryByText(adminTexts.tabQueue)).not.toBeInTheDocument();
  });
});

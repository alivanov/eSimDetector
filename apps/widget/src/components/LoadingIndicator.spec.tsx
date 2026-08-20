import { render, screen } from '@testing-library/react';

import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  it('показывает переданный текст сопровождения', () => {
    render(<LoadingIndicator label="Определяем ваше устройство…" />);
    expect(screen.getByText('Определяем ваше устройство…')).toBeInTheDocument();
  });
});

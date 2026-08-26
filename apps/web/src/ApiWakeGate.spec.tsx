import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ApiWakeGate } from './ApiWakeGate';
import { homeWakeTexts } from './homeTexts';
import { waitForApiReady } from './wait-for-api-ready';

jest.mock('./wait-for-api-ready');

const waitForApiReadyMock = jest.mocked(waitForApiReady);

describe('ApiWakeGate', () => {
  beforeEach(() => {
    waitForApiReadyMock.mockReset();
  });

  it('показывает спиннер пробуждения, затем дочерний контент', async () => {
    waitForApiReadyMock.mockResolvedValue(undefined);

    render(
      <ApiWakeGate apiBase="">
        <p>Готово</p>
      </ApiWakeGate>,
    );

    expect(screen.getByText(homeWakeTexts.loading)).toBeInTheDocument();
    expect(await screen.findByText('Готово')).toBeInTheDocument();
    expect(waitForApiReadyMock).toHaveBeenCalledWith({ apiBase: '' });
  });

  it('при ошибке показывает повтор', async () => {
    waitForApiReadyMock.mockRejectedValueOnce(new Error('timeout'));

    render(
      <ApiWakeGate apiBase="">
        <p>Готово</p>
      </ApiWakeGate>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(homeWakeTexts.failed);

    waitForApiReadyMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: homeWakeTexts.retry }));

    await waitFor(() => {
      expect(screen.getByText('Готово')).toBeInTheDocument();
    });
  });
});

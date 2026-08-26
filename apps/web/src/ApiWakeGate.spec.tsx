import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ApiWakeGate } from './ApiWakeGate';
import { homeWakeTexts } from './homeTexts';
import { loadRuntimeConfig } from './runtime-config';
import { waitForApiReady } from './wait-for-api-ready';

jest.mock('./runtime-config');
jest.mock('./wait-for-api-ready');

const loadRuntimeConfigMock = jest.mocked(loadRuntimeConfig);
const waitForApiReadyMock = jest.mocked(waitForApiReady);

describe('ApiWakeGate', () => {
  beforeEach(() => {
    loadRuntimeConfigMock.mockReset();
    waitForApiReadyMock.mockReset();
    loadRuntimeConfigMock.mockResolvedValue({
      apiOrigin: 'https://esim-detector-api.onrender.com',
    });
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
    expect(waitForApiReadyMock).toHaveBeenCalledWith({
      apiBase: '',
      wakeOrigin: 'https://esim-detector-api.onrender.com',
    });
  });

  it('при ошибке показывает заметную кнопку «Повторить»', async () => {
    waitForApiReadyMock.mockRejectedValueOnce(new Error('timeout'));

    render(
      <ApiWakeGate apiBase="">
        <p>Готово</p>
      </ApiWakeGate>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(homeWakeTexts.failed);
    const retry = screen.getByRole('button', { name: homeWakeTexts.retry });
    expect(retry.className).toMatch(/retryButton/);

    waitForApiReadyMock.mockResolvedValueOnce(undefined);
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByText('Готово')).toBeInTheDocument();
    });
  });
});

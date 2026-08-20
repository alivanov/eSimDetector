import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { buildFakeResponse, installFetchMock } from '../test-utils/fetch-mock';

import { ManualSearch } from './ManualSearch';

function suggestBody(suggestions: readonly { id: string; name: string; brand: string }[]) {
  return { requestId: 'r-1', query: { raw: 'iph', normalized: 'iph' }, suggestions };
}

describe('ManualSearch — ручной поиск с подсказками (docs/13-branding.md §13.6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('запрашивает подсказки с задержкой ввода и показывает их доступным списком', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        body: suggestBody([
          { id: 'apple-iphone-13', name: 'iPhone 13', brand: 'Apple' },
          { id: 'apple-iphone-13-pro', name: 'iPhone 13 Pro', brand: 'Apple' },
        ]),
      }),
    );

    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={jest.fn()}
        isSubmitting={false}
        onBackToAutoDetect={jest.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Название устройства' });
    fireEvent.change(input, { target: { value: 'iph' } });

    // Пока не прошла задержка ввода, запрос ещё не отправлен.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: 'Варианты устройств' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'iPhone 13 · Apple' })).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('навигация стрелками и Enter выбирают активную подсказку, вызывая onSubmit', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({
        body: suggestBody([
          { id: 'apple-iphone-13', name: 'iPhone 13', brand: 'Apple' },
          { id: 'apple-iphone-13-pro', name: 'iPhone 13 Pro', brand: 'Apple' },
        ]),
      }),
    );
    const onSubmit = jest.fn();

    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={onSubmit}
        isSubmitting={false}
        onBackToAutoDetect={jest.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Название устройства' });
    fireEvent.change(input, { target: { value: 'iph' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-1'));

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('iPhone 13 Pro');
  });

  it('Escape закрывает список подсказок', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(
      buildFakeResponse({ body: suggestBody([{ id: 'a', name: 'iPhone 13', brand: 'Apple' }]) }),
    );

    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={jest.fn()}
        isSubmitting={false}
        onBackToAutoDetect={jest.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Название устройства' });
    fireEvent.change(input, { target: { value: 'iph' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('отправка формы с пустым запросом показывает «Введите не меньше одного символа.»', () => {
    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={jest.fn()}
        isSubmitting={false}
        onBackToAutoDetect={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(screen.getByText('Введите не меньше одного символа.')).toBeInTheDocument();
  });

  it('отправка формы с непустым запросом вызывает onSubmit с обрезанным текстом', () => {
    const onSubmit = jest.fn();
    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={onSubmit}
        isSubmitting={false}
        onBackToAutoDetect={jest.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Название устройства' });
    fireEvent.change(input, { target: { value: '  iPhone 15 Pro  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(onSubmit).toHaveBeenCalledWith('iPhone 15 Pro');
  });

  it('во время отправки кнопка показывает «Ищем устройство…» и недоступна', () => {
    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={jest.fn()}
        isSubmitting={true}
        onBackToAutoDetect={jest.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Ищем устройство…' });
    expect(button).toBeDisabled();
  });

  it('кнопка «Вернуться к автоопределению» вызывает переданный обработчик', () => {
    const onBackToAutoDetect = jest.fn();
    render(
      <ManualSearch
        baseUrl="http://api.local"
        onSubmit={jest.fn()}
        isSubmitting={false}
        onBackToAutoDetect={onBackToAutoDetect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к автоопределению' }));
    expect(onBackToAutoDetect).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';

import type { Presentation } from '../api/presentation';

import { ResultCard } from './ResultCard';

const supportedPresentation: Presentation = {
  title: 'Ваше устройство поддерживает eSIM',
  description: 'Samsung Galaxy S24 Ultra может использовать eSIM вместе с физической SIM-картой.',
  primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
  secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
};

const notSupportedPresentation: Presentation = {
  title: 'Ваше устройство не поддерживает eSIM',
  description: 'iPhone X не поддерживает технологию eSIM.',
  secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
};

const clarificationPresentation: Presentation = {
  title: 'Нужно уточнить модель устройства',
  description: 'Несколько моделей iPhone выглядят для браузера одинаково. Выберите вашу.',
  primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
};

describe('ResultCard — три статуса результата (docs/13-branding.md §13.5)', () => {
  it('supported: заголовок, пояснение, оба действия дословно из presentation', () => {
    const onAction = jest.fn();
    render(
      <ResultCard status="supported" presentation={supportedPresentation} onAction={onAction} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Ваше устройство поддерживает eSIM' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Samsung Galaxy S24 Ultra может использовать eSIM вместе с физической SIM-картой.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подключить eSIM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Это не моё устройство' })).toBeInTheDocument();
  });

  it('not_supported: primaryAction ОТСУТСТВУЕТ, есть только secondaryAction', () => {
    const onAction = jest.fn();
    render(
      <ResultCard
        status="not_supported"
        presentation={notSupportedPresentation}
        onAction={onAction}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Ваше устройство не поддерживает eSIM' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подключить eSIM' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Это не моё устройство' })).toBeInTheDocument();
  });

  it('clarification_required: заголовок и «Выбрать модель», без secondaryAction', () => {
    const onAction = jest.fn();
    render(
      <ResultCard
        status="clarification_required"
        presentation={clarificationPresentation}
        onAction={onAction}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Нужно уточнить модель устройства' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Выбрать модель' })).toBeInTheDocument();
  });

  it('клик по действию вызывает onAction с этим действием и разметкой primary/secondary', () => {
    const onAction = jest.fn();
    render(
      <ResultCard status="supported" presentation={supportedPresentation} onAction={onAction} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Подключить eSIM' }));
    expect(onAction).toHaveBeenCalledWith(
      { label: 'Подключить eSIM', kind: 'continue' },
      'primary',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Это не моё устройство' }));
    expect(onAction).toHaveBeenCalledWith(
      { label: 'Это не моё устройство', kind: 'manual_search' },
      'secondary',
    );
  });

  it('показывает адресную подпись и метку типа устройства, если переданы', () => {
    render(
      <ResultCard
        status="supported"
        presentation={supportedPresentation}
        deviceTypeLabel="Планшет"
        deviceTypeNotice="Похоже, вы на компьютере. Укажите телефон или планшет вручную."
        onAction={jest.fn()}
      />,
    );
    expect(screen.getByText('Планшет')).toBeInTheDocument();
    expect(
      screen.getByText('Похоже, вы на компьютере. Укажите телефон или планшет вручную.'),
    ).toBeInTheDocument();
  });
});

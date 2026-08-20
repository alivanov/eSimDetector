import { fireEvent, render, screen } from '@testing-library/react';

import type { Clarification } from '../api/clarification';

import { ClarificationScreen } from './ClarificationScreen';

function renderScreen(clarification: Clarification) {
  const onChooseCandidate = jest.fn();
  const onAnswerQuestion = jest.fn();
  const onManualInput = jest.fn();
  render(
    <ClarificationScreen
      clarification={clarification}
      onChooseCandidate={onChooseCandidate}
      onAnswerQuestion={onAnswerQuestion}
      onManualInput={onManualInput}
    />,
  );
  return { onChooseCandidate, onAnswerQuestion, onManualInput };
}

describe('ClarificationScreen — четыре значения clarification.kind (docs/03 §3.7)', () => {
  it('choose_candidate: клик по варианту вызывает onChooseCandidate', () => {
    const { onChooseCandidate, onManualInput } = renderScreen({
      kind: 'choose_candidate',
      question: 'Уточните модель вашего iPhone',
      options: [
        { id: 'apple-iphone-x', label: 'iPhone X' },
        { id: 'apple-iphone-xs', label: 'iPhone XS' },
        { id: '__other__', label: 'Другая модель' },
      ],
    });

    expect(screen.getByText('Уточните модель вашего iPhone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'iPhone XS' }));
    expect(onChooseCandidate).toHaveBeenCalledWith({ id: 'apple-iphone-xs', label: 'iPhone XS' });
    expect(onManualInput).not.toHaveBeenCalled();
  });

  it('choose_candidate: клик по __other__ уводит в ручной поиск, а НЕ в onChooseCandidate', () => {
    const { onChooseCandidate, onManualInput } = renderScreen({
      kind: 'choose_candidate',
      question: 'Уточните модель вашего iPhone',
      options: [
        { id: 'apple-iphone-x', label: 'iPhone X' },
        { id: '__other__', label: 'Другая модель' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Другая модель' }));
    expect(onManualInput).toHaveBeenCalledTimes(1);
    expect(onChooseCandidate).not.toHaveBeenCalled();
  });

  it('answer_question: клик по варианту вызывает onAnswerQuestion с его id', () => {
    const { onAnswerQuestion } = renderScreen({
      kind: 'answer_question',
      question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
      options: [
        { id: 'CN', label: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)' },
        { id: 'OTHER', label: 'Одну nano-SIM (все остальные версии)' },
      ],
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)',
      }),
    );
    expect(onAnswerQuestion).toHaveBeenCalledWith('CN');
  });

  it('answer_question: показывает кнопку отказа «Не знаю — искать по названию»', () => {
    const { onManualInput } = renderScreen({
      kind: 'answer_question',
      question: 'q',
      options: [{ id: 'CN', label: 'CN' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Не знаю — искать по названию' }));
    expect(onManualInput).toHaveBeenCalledTimes(1);
  });

  it('manual_input: показывает вопрос и переход к ручному поиску', () => {
    const { onManualInput } = renderScreen({
      kind: 'manual_input',
      question: 'Введите модель вручную',
    });
    expect(screen.getByText('Введите модель вручную')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Указать устройство вручную' }));
    expect(onManualInput).toHaveBeenCalledTimes(1);
  });

  it('check_on_device: показывает инструкцию и кнопку отказа', () => {
    const { onManualInput } = renderScreen({
      kind: 'check_on_device',
      question: 'Проверьте наличие eSIM в настройках устройства.',
    });
    expect(screen.getByText('Проверьте наличие eSIM в настройках устройства.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Не знаю — искать по названию' }));
    expect(onManualInput).toHaveBeenCalledTimes(1);
  });
});

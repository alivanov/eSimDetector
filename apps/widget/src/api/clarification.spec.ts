import { parseClarification } from './clarification';

describe('parseClarification', () => {
  it('undefined — блок отсутствует в ответе (статус определён однозначно)', () => {
    expect(parseClarification(undefined)).toBeUndefined();
  });

  it.each(['choose_candidate', 'answer_question', 'manual_input', 'check_on_device'])(
    'разбирает kind=%s',
    (kind) => {
      const result = parseClarification({ kind, question: 'Вопрос?' });
      expect(result).toEqual({ kind, question: 'Вопрос?' });
    },
  );

  it('choose_candidate с options, включая __other__', () => {
    const result = parseClarification({
      kind: 'choose_candidate',
      question: 'Уточните модель вашего iPhone',
      options: [
        { id: 'apple-iphone-x', label: 'iPhone X' },
        { id: '__other__', label: 'Другая модель' },
      ],
    });
    expect(result?.options).toHaveLength(2);
    expect(result?.options?.[1]).toEqual({ id: '__other__', label: 'Другая модель' });
  });

  it('неизвестный kind — undefined', () => {
    expect(parseClarification({ kind: 'something_else', question: 'q' })).toBeUndefined();
  });

  it('без question — undefined', () => {
    expect(parseClarification({ kind: 'manual_input' })).toBeUndefined();
  });

  it('options неверной формы — undefined', () => {
    expect(
      parseClarification({ kind: 'choose_candidate', question: 'q', options: [{ id: 1 }] }),
    ).toBeUndefined();
  });

  it('не объект — undefined', () => {
    expect(parseClarification('x')).toBeUndefined();
  });
});

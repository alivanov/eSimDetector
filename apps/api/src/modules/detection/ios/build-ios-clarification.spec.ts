import {
  buildSampleDevice,
  type Device,
  type EsimClarifyingQuestion,
} from '@esim-detector/contracts';

import { buildIosClarification, findSharedClarifyingQuestion } from './build-ios-clarification';

const REGION_QUESTION: EsimClarifyingQuestion = {
  kind: 'region',
  question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
  options: [
    { value: 'CN', label: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)' },
    { value: 'OTHER', label: 'Одну nano-SIM (все остальные версии)' },
  ],
};

function conditionalDevice(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice({
    platform: 'ios',
    brand: 'apple',
    brandTitle: 'Apple',
    modelCodes: [],
    aliases: [],
    screenSignatures: [],
    esim: {
      support: 'conditional',
      dualSim: 'physical+esim',
      maxProfiles: 8,
      conditions: [
        { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР' },
      ],
      clarifyingQuestion: REGION_QUESTION,
      notes: '',
    },
    ...overrides,
  });
}

function unconditionalDevice(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice({
    platform: 'ios',
    brand: 'apple',
    brandTitle: 'Apple',
    modelCodes: [],
    aliases: [],
    screenSignatures: [],
    esim: {
      support: 'supported',
      dualSim: 'physical+esim',
      maxProfiles: 8,
      conditions: [],
      clarifyingQuestion: null,
      notes: '',
    },
    ...overrides,
  });
}

describe('findSharedClarifyingQuestion', () => {
  it('возвращает вопрос, когда он буквально совпадает у всех кандидатов', () => {
    const a = conditionalDevice({ _id: 'apple-iphone-14-pro' });
    const b = conditionalDevice({ _id: 'apple-iphone-15' });

    expect(findSharedClarifyingQuestion([a, b])).toEqual(REGION_QUESTION);
  });

  it('возвращает undefined, если хотя бы у одного кандидата условий нет (iPhone 17e рядом с условными)', () => {
    const conditional = conditionalDevice({ _id: 'apple-iphone-14' });
    const unconditional = unconditionalDevice({ _id: 'apple-iphone-17e' });

    expect(findSharedClarifyingQuestion([conditional, unconditional])).toBeUndefined();
  });

  it('возвращает undefined, если вопросы кандидатов расходятся текстом', () => {
    const a = conditionalDevice({ _id: 'apple-iphone-14-pro' });
    const b = conditionalDevice({
      _id: 'apple-iphone-se-3',
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 8,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'другое условие' },
        ],
        clarifyingQuestion: { ...REGION_QUESTION, question: 'Другой вопрос вообще' },
        notes: '',
      },
    });

    expect(findSharedClarifyingQuestion([a, b])).toBeUndefined();
  });

  it('возвращает undefined, если у кандидата условия покрывают больше одного scope', () => {
    const mixedScope = conditionalDevice({
      _id: 'apple-iphone-mixed',
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 8,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'регион' },
          { scope: 'osVersion', value: '15.0', support: 'not_supported', note: 'версия ОС' },
        ],
        clarifyingQuestion: REGION_QUESTION,
        notes: '',
      },
    });

    expect(findSharedClarifyingQuestion([mixedScope])).toBeUndefined();
  });

  it('возвращает undefined на пустом списке кандидатов', () => {
    expect(findSharedClarifyingQuestion([])).toBeUndefined();
  });
});

describe('buildIosClarification', () => {
  it('общий вопрос у всех кандидатов → answer_question с этим вопросом', () => {
    const a = conditionalDevice({ _id: 'apple-iphone-14-pro', displayName: 'iPhone 14 Pro' });
    const b = conditionalDevice({ _id: 'apple-iphone-15', displayName: 'iPhone 15' });

    const clarification = buildIosClarification([a, b]);

    expect(clarification).toEqual({
      kind: 'answer_question',
      question: REGION_QUESTION.question,
      options: [
        { id: 'CN', label: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)' },
        { id: 'OTHER', label: 'Одну nano-SIM (все остальные версии)' },
      ],
    });
  });

  it('хотя бы один кандидат без условия → выбор из списка моделей, а не адресный вопрос', () => {
    const conditional = conditionalDevice({ _id: 'apple-iphone-14', displayName: 'iPhone 14' });
    const unconditional = unconditionalDevice({
      _id: 'apple-iphone-17e',
      displayName: 'iPhone 17e',
    });

    const clarification = buildIosClarification([conditional, unconditional]);

    expect(clarification.kind).toBe('choose_candidate');
    expect(clarification.options?.map((option) => option.id)).toEqual(
      expect.arrayContaining(['apple-iphone-14', 'apple-iphone-17e', '__other__']),
    );
  });

  it('кандидатов нет → manual_input, а не пустой список выбора', () => {
    const clarification = buildIosClarification([]);

    expect(clarification).toEqual({
      kind: 'manual_input',
      question: 'Не удалось определить модель iPhone. Введите модель вручную.',
    });
  });
});

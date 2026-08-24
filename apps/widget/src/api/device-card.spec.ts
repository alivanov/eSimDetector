import { parseDeviceCard } from './device-card';
import { resultViewFromDeviceCard } from './result-from-device-card';

const supportedCard = {
  id: 'apple-iphone-xs',
  brand: 'apple',
  brandTitle: 'Apple',
  marketingName: 'iPhone XS',
  name: 'Apple iPhone XS',
  family: 'iphone-xs',
  generation: null,
  modifiers: [],
  modelCodes: [],
  platform: 'ios',
  deviceType: 'phone',
  esim: {
    support: 'supported',
    dualSim: 'physical+esim',
    maxProfiles: 8,
    conditions: [],
    clarifyingQuestion: null,
    notes: '',
  },
  releaseYear: 2018,
  sources: [],
  dataConfidence: 'verified',
};

describe('parseDeviceCard', () => {
  it('разбирает карточку supported', () => {
    const parsed = parseDeviceCard(supportedCard);
    expect(parsed?.id).toBe('apple-iphone-xs');
    expect(parsed?.esim.support).toBe('supported');
    expect(parsed?.esim.clarifyingQuestion).toBeNull();
  });

  it('переводит clarifyingQuestion карточки в clarification с id = value', () => {
    const parsed = parseDeviceCard({
      ...supportedCard,
      id: 'apple-iphone-xs-max',
      name: 'Apple iPhone XS Max',
      esim: {
        ...supportedCard.esim,
        support: 'conditional',
        clarifyingQuestion: {
          kind: 'region',
          question: 'Лоток для SIM?',
          options: [
            { value: 'CN', label: 'Две nano-SIM' },
            { value: 'OTHER', label: 'Одну nano-SIM' },
          ],
        },
      },
    });
    expect(parsed?.esim.clarifyingQuestion).toEqual({
      kind: 'answer_question',
      question: 'Лоток для SIM?',
      options: [
        { id: 'CN', label: 'Две nano-SIM' },
        { id: 'OTHER', label: 'Одну nano-SIM' },
      ],
    });
  });

  it('отклоняет карточку без обязательных полей', () => {
    expect(parseDeviceCard({ id: 'x' })).toBeUndefined();
  });
});

describe('resultViewFromDeviceCard', () => {
  it('supported → однозначный результат с presentation exactModelKnown', () => {
    const card = parseDeviceCard(supportedCard);
    expect(card).toBeDefined();
    const view = resultViewFromDeviceCard(card!);
    expect(view.status).toBe('supported');
    expect(view.clarification).toBeUndefined();
    expect(view.presentation.title).toBe('Ваше устройство поддерживает eSIM');
    expect(view.presentation.description).toContain('Apple iPhone XS может использовать eSIM');
  });

  it('conditional → clarification_required с вопросом из карточки', () => {
    const card = parseDeviceCard({
      ...supportedCard,
      id: 'apple-iphone-xs-max',
      name: 'Apple iPhone XS Max',
      esim: {
        ...supportedCard.esim,
        support: 'conditional',
        clarifyingQuestion: {
          kind: 'region',
          question: 'Лоток для SIM?',
          options: [{ value: 'OTHER', label: 'Одну nano-SIM' }],
        },
      },
    });
    expect(card).toBeDefined();
    const view = resultViewFromDeviceCard(card!);
    expect(view.status).toBe('clarification_required');
    expect(view.clarification?.kind).toBe('answer_question');
    expect(view.clarification?.question).toBe('Лоток для SIM?');
  });
});

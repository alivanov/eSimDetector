import type { EsimInfo } from '@esim-detector/contracts';

import { resolveEsimConditions } from './conditions';

const clarifyingQuestion: EsimInfo['clarifyingQuestion'] = {
  kind: 'region',
  question: 'Устройство приобретено в Китае?',
  options: [
    { value: 'yes', label: 'Да' },
    { value: 'no', label: 'Нет' },
  ],
};

function conditionalEsim(overrides: Partial<EsimInfo> = {}): EsimInfo {
  return {
    support: 'conditional',
    dualSim: 'physical+esim',
    maxProfiles: 2,
    conditions: [
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР без eSIM' },
    ],
    clarifyingQuestion,
    notes: '',
    ...overrides,
  };
}

describe('resolveEsimConditions', () => {
  it('esim.support уже не conditional — статус берётся напрямую', () => {
    const esim: EsimInfo = {
      support: 'supported',
      dualSim: 'physical+esim',
      maxProfiles: 2,
      conditions: [],
      clarifyingQuestion: null,
      notes: '',
    };

    const result = resolveEsimConditions(esim);

    expect(result.status).toBe('supported');
    expect(result.reasons[0]?.code).toBe('ESIM_STATUS_DIRECT');
  });

  it('регион совпадает с условием — возвращает статус условия (docs/05 §5.4, случай 1)', () => {
    const result = resolveEsimConditions(conditionalEsim(), { region: 'cn' });

    expect(result.status).toBe('not_supported');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_MATCHED_REGION');
    expect(result.matchedCondition).toMatchObject({ scope: 'region', value: 'CN' });
  });

  it('регион известен и не совпадает ни с одним условием — default "supported" (conditions — исключения)', () => {
    const result = resolveEsimConditions(conditionalEsim(), { region: 'RU' });

    expect(result.status).toBe('supported');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_DEFAULT_SUPPORTED');
  });

  it('регион неизвестен — уточнение со сценарием ADR-007, а не догадка', () => {
    const result = resolveEsimConditions(conditionalEsim(), {});

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_CONTEXT_MISSING');
    expect(result.clarification).toEqual(clarifyingQuestion);
  });

  it('версия ОС ниже порога условия — статус условия (docs/05 §5.4, случай 4)', () => {
    const esim = conditionalEsim({
      conditions: [
        {
          scope: 'osVersion',
          value: '15.0',
          support: 'not_supported',
          note: 'eSIM появилась в 15.0',
        },
      ],
    });

    const result = resolveEsimConditions(esim, { osVersion: '14.5' });

    expect(result.status).toBe('not_supported');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_MATCHED_OS_VERSION');
  });

  it('версия ОС на/выше порога условия — default "supported"', () => {
    const esim = conditionalEsim({
      conditions: [
        {
          scope: 'osVersion',
          value: '15.0',
          support: 'not_supported',
          note: 'eSIM появилась в 15.0',
        },
      ],
    });

    const result = resolveEsimConditions(esim, { osVersion: '15.0' });

    expect(result.status).toBe('supported');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_DEFAULT_SUPPORTED');
  });

  it('сравнение версии ОС числовое, а не лексикографическое (9.0 < 15.0)', () => {
    const esim = conditionalEsim({
      conditions: [{ scope: 'osVersion', value: '15.0', support: 'not_supported', note: '...' }],
    });

    const result = resolveEsimConditions(esim, { osVersion: '9.0' });

    expect(result.status).toBe('not_supported');
  });

  it('сравнение версий с разным числом сегментов (контекст короче условия) — недостающие сегменты считаются нулём', () => {
    const esim = conditionalEsim({
      conditions: [{ scope: 'osVersion', value: '18.5.1', support: 'not_supported', note: '...' }],
    });

    const result = resolveEsimConditions(esim, { osVersion: '18' });

    expect(result.status).toBe('not_supported');
  });

  it('сравнение версий с разным числом сегментов (условие короче контекста) — недостающие сегменты считаются нулём', () => {
    const esim = conditionalEsim({
      conditions: [{ scope: 'osVersion', value: '18.5', support: 'not_supported', note: '...' }],
    });

    const result = resolveEsimConditions(esim, { osVersion: '18.5.1' });

    expect(result.status).toBe('supported');
  });

  it('версия ОС неизвестна — уточнение', () => {
    const esim = conditionalEsim({
      conditions: [{ scope: 'osVersion', value: '15.0', support: 'not_supported', note: '...' }],
    });

    const result = resolveEsimConditions(esim, {});

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_CONTEXT_MISSING');
  });

  it('несколько условий разных scope: регион известен и совпадает — возвращает результат без версии ОС', () => {
    const esim = conditionalEsim({
      conditions: [
        { scope: 'region', value: 'CN', support: 'not_supported', note: '...' },
        { scope: 'osVersion', value: '15.0', support: 'not_supported', note: '...' },
      ],
    });

    const result = resolveEsimConditions(esim, { region: 'CN' });

    expect(result.status).toBe('not_supported');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_MATCHED_REGION');
  });

  it('conditional без conditions (нарушение инварианта §5.8 п.5) — защитная ветка, а не исключение', () => {
    const esim = conditionalEsim({ conditions: [] });

    const result = resolveEsimConditions(esim, { region: 'RU' });

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_INVALID_CONFIGURATION');
  });

  it('регион неизвестен и clarifyingQuestion не заполнен (нарушение данных) — уточнение без поля clarification', () => {
    const esim = conditionalEsim({ clarifyingQuestion: null });

    const result = resolveEsimConditions(esim, {});

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('ESIM_CONDITION_CONTEXT_MISSING');
    expect(result.clarification).toBeUndefined();
  });

  it('conditional без conditions и без clarifyingQuestion — защитная ветка без поля clarification', () => {
    const esim = conditionalEsim({ conditions: [], clarifyingQuestion: null });

    const result = resolveEsimConditions(esim, {});

    expect(result.status).toBe('clarification_required');
    expect(result.clarification).toBeUndefined();
  });
});

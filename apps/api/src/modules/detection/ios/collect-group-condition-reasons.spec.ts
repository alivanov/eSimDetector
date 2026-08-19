import {
  DEFAULT_CATALOG_ANSWER_POLICY,
  buildSampleDevice,
  type Device,
} from '@esim-detector/contracts';

import { collectGroupConditionReasons } from './collect-group-condition-reasons';

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
      clarifyingQuestion: {
        kind: 'region',
        question: 'Вопрос?',
        options: [
          { value: 'CN', label: 'Да' },
          { value: 'OTHER', label: 'Нет' },
        ],
      },
      notes: '',
    },
    ...overrides,
  });
}

describe('collectGroupConditionReasons', () => {
  it('регион совпал с условием у всех кандидатов → один код ESIM_CONDITION_MATCHED_REGION, без дублей', () => {
    const a = conditionalDevice({ _id: 'apple-iphone-14-pro' });
    const b = conditionalDevice({ _id: 'apple-iphone-15' });

    const reasons = collectGroupConditionReasons(
      [a, b],
      { region: 'CN' },
      DEFAULT_CATALOG_ANSWER_POLICY,
    );

    expect(reasons.filter((r) => r.code === 'ESIM_CONDITION_MATCHED_REGION')).toHaveLength(1);
  });

  it('регион не совпал ни с одним условием → ESIM_CONDITION_DEFAULT_SUPPORTED', () => {
    const a = conditionalDevice({ _id: 'apple-iphone-14-pro' });

    const reasons = collectGroupConditionReasons(
      [a],
      { region: 'RU' },
      DEFAULT_CATALOG_ANSWER_POLICY,
    );

    expect(reasons.some((r) => r.code === 'ESIM_CONDITION_DEFAULT_SUPPORTED')).toBe(true);
  });

  it('без кандидатов возвращает пустой список', () => {
    expect(collectGroupConditionReasons([], {}, DEFAULT_CATALOG_ANSWER_POLICY)).toEqual([]);
  });
});

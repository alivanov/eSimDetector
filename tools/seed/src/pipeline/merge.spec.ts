import { buildSampleDevice } from '@esim-detector/contracts';

import type { DeviceCandidate } from '../domain/types';
import type { ConsensusDevice } from './consensus';
import { decideMergeSource, parseCuratedDevices } from './merge';

function candidate(overrides: Partial<DeviceCandidate> = {}): DeviceCandidate {
  return {
    id: 'apple-iphone-13',
    brand: 'apple',
    brandTitle: 'Apple',
    marketingName: 'iPhone 13',
    family: 'iphone',
    generation: 13,
    modifiers: [],
    modelCodes: [],
    platform: 'ios',
    deviceType: 'phone',
    releaseYear: 2021,
    esimSupport: 'yes',
    esimConditions: [],
    provenance: {
      source: 'llm:test-model',
      batchId: '01-apple-iphone',
      importedAt: new Date('2026-08-18'),
      lineNumber: 2,
    },
    ...overrides,
  };
}

function consensusDevice(overrides: Partial<ConsensusDevice> = {}): ConsensusDevice {
  return {
    representative: candidate(),
    esimSupport: 'yes',
    esimConditions: [],
    outcome: 'unanimous',
    agreementCount: 2,
    contributingSources: ['llm:model-a', 'llm:model-b'],
    sourceDisagreement: false,
    ...overrides,
  };
}

describe('parseCuratedDevices', () => {
  it('разбирает валидные записи и собирает ошибки по невалидным отдельно', () => {
    const valid = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    const result = parseCuratedDevices(
      new Map<string, unknown>([
        ['samsung-galaxy-s24-ultra.json', valid],
        ['broken.json', { not: 'a device' }],
      ]),
    );
    expect(result.devices.get('samsung-galaxy-s24-ultra')).toEqual(valid);
    expect(result.errors).toHaveLength(1);
  });
});

describe('decideMergeSource', () => {
  it('курируемое ядро побеждает целиком, даже если CSV дал иной статус (docs/14 §14.4 шаг 6, приоритет 2)', () => {
    const curated = buildSampleDevice({ _id: 'apple-iphone-13', esim: { ...buildSampleDevice().esim, support: 'not_supported' } });
    const decision = decideMergeSource(
      consensusDevice(),
      new Map([['apple-iphone-13', curated]]),
    );
    expect(decision.source).toBe('curated');
    expect(decision.curatedDevice).toBe(curated);
  });

  it('применяет правило Apple по перечню поколений, когда устройства нет в курируемом ядре', () => {
    const decision = decideMergeSource(consensusDevice({ esimSupport: 'yes' }), new Map());
    expect(decision.source).toBe('rule:apple-generation');
    expect(decision.ruleEsimSupport).toBe('supported'); // iPhone 13 > iPhone XS/XR (2018)
    expect(decision.notices).toEqual([]); // CSV и правило согласны — конфликта нет
  });

  it('помечает APPLE_RULE_CONFLICT, когда CSV расходится с правилом, но правило приоритетнее', () => {
    const decision = decideMergeSource(
      consensusDevice({ esimSupport: 'no' }), // CSV ошибочно утверждает "no" для iPhone 13
      new Map(),
    );
    expect(decision.source).toBe('rule:apple-generation');
    expect(decision.ruleEsimSupport).toBe('supported');
    expect(decision.notices).toEqual([
      expect.objectContaining({ code: 'APPLE_RULE_CONFLICT', deviceId: 'apple-iphone-13' }),
    ]);
  });

  it('устройство iPhone до появления eSIM получает "not_supported" от правила', () => {
    const decision = decideMergeSource(
      consensusDevice({
        representative: candidate({ id: 'apple-iphone-8', family: 'iphone', generation: 8 }),
      }),
      new Map(),
    );
    expect(decision.ruleEsimSupport).toBe('not_supported');
  });

  it('устройства не Apple/не iOS проходят как обычный импорт из CSV', () => {
    const decision = decideMergeSource(
      consensusDevice({
        representative: candidate({
          id: 'samsung-galaxy-s24-ultra',
          brand: 'samsung',
          platform: 'android',
          family: 'galaxy-s',
        }),
      }),
      new Map(),
    );
    expect(decision.source).toBe('import');
  });

  it('Apple-модель без числа поколения (правило не знает модель) проходит как обычный импорт', () => {
    const decision = decideMergeSource(
      consensusDevice({
        representative: candidate({ id: 'apple-iphone-unknown', family: 'iphone', generation: null }),
      }),
      new Map(),
    );
    expect(decision.source).toBe('import');
  });
});

import { buildSampleDevice } from '@esim-detector/contracts';

import type { DeviceCandidate } from '../domain/types';
import { buildCatalog } from './build-catalog';

const NOW = new Date('2026-08-18T00:00:00Z');

function candidate(overrides: Partial<DeviceCandidate> = {}): DeviceCandidate {
  return {
    id: 'samsung-galaxy-s24-ultra',
    brand: 'samsung',
    brandTitle: 'Samsung',
    marketingName: 'Galaxy S24 Ultra',
    family: 'galaxy-s',
    generation: 24,
    modifiers: ['ultra'],
    modelCodes: ['SM-S928B'],
    platform: 'android',
    deviceType: 'phone',
    releaseYear: 2024,
    esimSupport: 'yes',
    esimConditions: [],
    provenance: {
      source: 'llm:model-a',
      batchId: '02-samsung-galaxy-s',
      importedAt: NOW,
      lineNumber: 2,
    },
    ...overrides,
  };
}

describe('buildCatalog', () => {
  it('строит устройства из согласованных кандидатов нескольких источников', () => {
    const result = buildCatalog({
      candidates: [
        candidate({
          sourceUrl: 'https://www.samsung.com/galaxy-s24-ultra',
          provenance: { ...candidate().provenance, source: 'llm:model-a' },
        }),
        candidate({
          sourceUrl: 'https://www.samsung.com/galaxy-s24-ultra',
          provenance: { ...candidate().provenance, source: 'llm:model-b' },
        }),
      ],
      curatedDevices: new Map(),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.dataConfidence).toBe('derived');
    expect(result.invariantViolations).toEqual([]);
    expect(result.quarantine).toEqual([]);
  });

  it('курируемое ядро побеждает и не пересобирается', () => {
    const curated = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    const result = buildCatalog({
      candidates: [candidate()],
      curatedDevices: new Map([['samsung-galaxy-s24-ultra', curated]]),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.devices).toEqual([curated]);
    expect(result.curatedAppliedCount).toBe(1);
    expect(result.appleRuleAppliedCount).toBe(0);
  });

  it('курируемая запись без единой строки CSV попадает в справочник (курируемое ядро Apple, §А.8.3)', () => {
    // В собранном массиве ноль строк с платформой ios, поэтому у записей ядра Apple нет и не
    // может быть кандидата консенсуса: без отдельного прохода по остатку курируемого ядра они
    // никогда не попали бы в `devices`.
    const curated = buildSampleDevice({
      _id: 'apple-iphone-15',
      brand: 'apple',
      brandTitle: 'Apple',
      marketingName: 'iPhone 15',
      family: 'iphone',
      generation: 15,
      modifiers: [],
      modelCodes: [],
      aliases: ['iphone 15'],
      platform: 'ios',
      os: { minVersion: '17.0', maxVersion: '26.6.1' },
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
    });

    const result = buildCatalog({
      candidates: [candidate()],
      curatedDevices: new Map([['apple-iphone-15', curated]]),
      now: NOW,
      familyMinRecords: 3,
    });

    expect(result.devices.map((device) => device._id)).toEqual([
      'samsung-galaxy-s24-ultra',
      'apple-iphone-15',
    ]);
    expect(result.curatedAppliedCount).toBe(1);
    expect(result.quarantine).toEqual([]);
  });

  it('курируемая запись, применённая к кандидату CSV, не дублируется остаточным проходом', () => {
    const curated = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    const result = buildCatalog({
      candidates: [candidate()],
      curatedDevices: new Map([['samsung-galaxy-s24-ultra', curated]]),
      now: NOW,
      familyMinRecords: 3,
    });

    expect(result.devices).toEqual([curated]);
    expect(result.curatedAppliedCount).toBe(1);
  });

  it('карантинит устройство iOS без курируемых сигнатур экрана (IOS_FIELDS_MISSING)', () => {
    const result = buildCatalog({
      candidates: [
        candidate({
          id: 'apple-iphone-13',
          brand: 'apple',
          platform: 'ios',
          family: 'iphone',
          generation: 13,
          modifiers: [],
        }),
      ],
      curatedDevices: new Map(),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.devices).toEqual([]);
    expect(result.appleRuleAppliedCount).toBe(1);
    expect(result.quarantine).toEqual([expect.objectContaining({ code: 'IOS_FIELDS_MISSING' })]);
  });

  it('вычисляет агрегаты уровня линейки для отчёта', () => {
    // Каждая из трёх моделей линейки подтверждена ДВУМЯ источниками — уровень "derived" для
    // каждой записи, поэтому агрегат по линейке (минимум 3 записи) учитывает все три.
    const candidatesForId = (
      id: string,
      marketingName: string,
      modelCode: string,
    ): DeviceCandidate[] => [
      candidate({
        id,
        brand: 'xiaomi',
        brandTitle: 'Xiaomi',
        family: 'redmi-a',
        marketingName,
        modelCodes: [modelCode],
        esimSupport: 'no',
        provenance: { ...candidate().provenance, source: 'llm:model-a' },
      }),
      candidate({
        id,
        brand: 'xiaomi',
        brandTitle: 'Xiaomi',
        family: 'redmi-a',
        marketingName,
        modelCodes: [modelCode],
        esimSupport: 'no',
        provenance: { ...candidate().provenance, source: 'llm:model-b' },
      }),
    ];
    const result = buildCatalog({
      candidates: [
        ...candidatesForId('xiaomi-redmi-a1', 'Redmi A1', 'ABC-A1'),
        ...candidatesForId('xiaomi-redmi-a2', 'Redmi A2', 'ABC-A2'),
        ...candidatesForId('xiaomi-redmi-a3', 'Redmi A3', 'ABC-A3'),
      ],
      curatedDevices: new Map(),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.familyAggregates).toHaveLength(1);
    expect(result.familyAggregates[0]?.rule).toEqual(
      expect.objectContaining({
        brand: 'xiaomi',
        family: 'redmi-a',
        status: 'not_supported',
        recordCount: 3,
      }),
    );
  });

  it('карантинит ОБЕ записи пары при нарушении DUPLICATE_MODEL_CODE, не блокируя загрузку целиком (ADR-029)', () => {
    const result = buildCatalog({
      candidates: [
        candidate({
          id: 'samsung-galaxy-a21',
          marketingName: 'Galaxy A21',
          modelCodes: ['SM-A217F'],
        }),
        candidate({
          id: 'samsung-galaxy-a21s',
          marketingName: 'Galaxy A21s',
          modelCodes: ['SM-A217F'],
          provenance: { ...candidate().provenance, source: 'llm:model-b' },
        }),
      ],
      curatedDevices: new Map(),
      now: NOW,
      familyMinRecords: 3,
    });
    // Оба кандидата — единственный источник для своего id, поэтому оба принимаются консенсусом
    // (внутриисточниковая коллизия кодов здесь неприменима — коды пришли от РАЗНЫХ источников), но
    // нарушают инвариант §5.8 п.2 между собой — обе записи карантинятся, а не блокируют загрузку.
    expect(result.devices).toEqual([]);
    expect(result.invariantQuarantinedCount).toBe(2);
    expect(
      result.invariantViolations.some((violation) => violation.code === 'DUPLICATE_MODEL_CODE'),
    ).toBe(true);
    const quarantinedIds = result.quarantine
      .filter((entry) => entry.code === 'DUPLICATE_MODEL_CODE')
      .map((entry) => entry.rawMarketingName);
    expect(quarantinedIds).toEqual(expect.arrayContaining(['Galaxy A21', 'Galaxy A21s']));
  });

  it('запись без нарушений остаётся в devices рядом с карантинированной парой', () => {
    const result = buildCatalog({
      candidates: [
        candidate({
          id: 'samsung-galaxy-a21',
          marketingName: 'Galaxy A21',
          modelCodes: ['SM-A217F'],
        }),
        candidate({
          id: 'samsung-galaxy-a21s',
          marketingName: 'Galaxy A21s',
          modelCodes: ['SM-A217F'],
          provenance: { ...candidate().provenance, source: 'llm:model-b' },
        }),
        candidate({ id: 'samsung-galaxy-s25', marketingName: 'Galaxy S25', modelCodes: ['SM-X1'] }),
      ],
      curatedDevices: new Map(),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.devices.map((device) => device._id)).toEqual(['samsung-galaxy-s25']);
    expect(result.invariantQuarantinedCount).toBe(2);
  });

  it('нарушение инварианта 6 (verified/supported без sources) карантинит только эту запись', () => {
    const curated = buildSampleDevice({
      _id: 'samsung-galaxy-broken',
      sources: [],
      dataConfidence: 'verified',
    });
    const result = buildCatalog({
      candidates: [candidate({ id: 'samsung-galaxy-broken' })],
      curatedDevices: new Map([['samsung-galaxy-broken', curated]]),
      now: NOW,
      familyMinRecords: 3,
    });
    expect(result.devices).toEqual([]);
    expect(result.invariantQuarantinedCount).toBe(1);
    expect(result.quarantine).toEqual([
      expect.objectContaining({ code: 'SUPPORTED_SOURCES_MISSING' }),
    ]);
  });
});

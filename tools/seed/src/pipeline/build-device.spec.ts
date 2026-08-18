import { deviceSchema } from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';

import type { DeviceCandidate } from '../domain/types';
import { buildDevice } from './build-device';
import type { ConsensusDevice } from './consensus';
import type { MergeDecision } from './merge';

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

const NOW = new Date('2026-08-18T00:00:00Z');
const IMPORT_DECISION: MergeDecision = { source: 'import', notices: [] };

describe('buildDevice', () => {
  it('строит валидную запись, проходящую deviceSchema.parse и все инварианты §5.8', () => {
    const device = buildDevice({
      consensusDevice: consensusDevice({
        representative: candidate({ sourceUrl: 'https://www.samsung.com/galaxy-s24-ultra' }),
      }),
      mergeDecision: IMPORT_DECISION,
      dataConfidence: 'derived',
      now: NOW,
    });

    expect(() => deviceSchema.parse(device)).not.toThrow();
    expect(validateCatalogInvariants([device]).valid).toBe(true);
    expect(device._id).toBe('samsung-galaxy-s24-ultra');
    expect(device.displayName).toBe('Samsung Galaxy S24 Ultra');
    expect(device.esim.support).toBe('supported');
    expect(device.provenance.source).toBe('consensus:llm:model-a+llm:model-b');
  });

  it('строит запись со статусом "conditional" и заполненным clarifyingQuestion (инвариант §5.8 п.5)', () => {
    const conditions = [
      { scope: 'region' as const, value: 'CN', support: 'not_supported' as const, note: 'region:CN=no' },
    ];
    const device = buildDevice({
      consensusDevice: consensusDevice({ esimSupport: 'conditional', esimConditions: conditions }),
      mergeDecision: IMPORT_DECISION,
      dataConfidence: 'derived',
      now: NOW,
    });
    expect(device.esim.support).toBe('conditional');
    expect(device.esim.conditions).toEqual(conditions);
    expect(device.esim.clarifyingQuestion).toEqual(
      expect.objectContaining({ kind: 'region', question: expect.any(String) }),
    );
    expect(validateCatalogInvariants([device]).valid).toBe(true);
  });

  it('запись правила Apple без sourceUrl получает источник-цитату на регламент (инвариант §5.8 п.6)', () => {
    const device = buildDevice({
      consensusDevice: consensusDevice({
        representative: candidate({ id: 'apple-iphone-13', brand: 'apple', platform: 'ios', family: 'iphone', generation: 13, modifiers: [] }),
      }),
      mergeDecision: { source: 'rule:apple-generation', ruleEsimSupport: 'supported', notices: [] },
      dataConfidence: 'verified',
      now: NOW,
    });
    expect(device.sources.length).toBeGreaterThan(0);
    expect(device.provenance.source).toBe('rule:apple-generation');
    // §5.8 п.4 (screenSignatures/os.maxVersion для iOS) не выполнен — это ОЖИДАЕМО: courируемое
    // ядро Apple пусто (docs/appendix-a §А.6, партии 1/9 "не заполнено"), а без него у CSV-записи
    // нет сигнатур экрана. Обязанность конвейера — обнаружить это ДО загрузки (`IOS_FIELDS_MISSING`,
    // командный уровень, `commands/load.ts`), а не притвориться валидной записью здесь.
    const violations = validateCatalogInvariants([device]).violations;
    expect(violations.some((violation) => violation.code === 'IOS_SCREEN_SIGNATURES_MISSING')).toBe(
      true,
    );
    expect(violations.some((violation) => violation.code === 'IOS_MAX_VERSION_MISSING')).toBe(true);
  });

  it('устройство "not_supported" не требует источника и всё равно валидно', () => {
    const device = buildDevice({
      consensusDevice: consensusDevice({ esimSupport: 'no' }),
      mergeDecision: IMPORT_DECISION,
      dataConfidence: 'unverified',
      now: NOW,
    });
    expect(device.esim.support).toBe('not_supported');
    expect(device.esim.dualSim).toBe('none');
    expect(validateCatalogInvariants([device]).valid).toBe(true);
  });

  it('псевдонимы содержат маркетинговое название и отображаемое имя в нижнем регистре', () => {
    const device = buildDevice({
      consensusDevice: consensusDevice(),
      mergeDecision: IMPORT_DECISION,
      dataConfidence: 'derived',
      now: NOW,
    });
    expect(device.aliases).toContain('galaxy s24 ultra');
    expect(device.aliases).toContain('samsung galaxy s24 ultra');
  });
});

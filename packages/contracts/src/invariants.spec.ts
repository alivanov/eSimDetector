import type { ScreenSignatureRecord } from './screen-signature.schema';
import { buildSampleDevice } from './test-fixtures';
import { validateCatalogInvariants } from './invariants';

function violationsOf(code: string, result: ReturnType<typeof validateCatalogInvariants>) {
  return result.violations.filter((violation) => violation.code === code);
}

describe('validateCatalogInvariants', () => {
  it('справочник без записей считается валидным (агент 3 должен работать на пустом справочнике)', () => {
    expect(validateCatalogInvariants([])).toEqual({ valid: true, violations: [] });
  });

  it('валидная запись без нарушений', () => {
    const result = validateCatalogInvariants([buildSampleDevice()]);

    expect(result.valid).toBe(true);
  });

  it('инвариант 1: одинаковый _id у двух записей — нарушение', () => {
    const a = buildSampleDevice({ _id: 'dup', modelCodes: ['SM-A'] });
    const b = buildSampleDevice({ _id: 'dup', modelCodes: ['SM-B'] });

    const result = validateCatalogInvariants([a, b]);

    expect(result.valid).toBe(false);
    expect(violationsOf('DUPLICATE_DEVICE_ID', result)).toHaveLength(1);
  });

  it('инвариант 2: один сервисный код у двух разных устройств — нарушение', () => {
    const a = buildSampleDevice({ _id: 'device-a', modelCodes: ['SM-S928B'] });
    const b = buildSampleDevice({ _id: 'device-b', modelCodes: ['sm-s928b'] });

    const result = validateCatalogInvariants([a, b]);

    expect(result.valid).toBe(false);
    expect(violationsOf('DUPLICATE_MODEL_CODE', result)).toHaveLength(1);
  });

  it('инвариант 2: один и тот же код у ОДНОГО устройства (продублирован в массиве) — не нарушение', () => {
    const device = buildSampleDevice({ modelCodes: ['SM-S928B', 'SM-S928B'] });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('DUPLICATE_MODEL_CODE', result)).toHaveLength(0);
  });

  it('инвариант 3: один псевдоним у двух устройств с РАЗНЫМ статусом eSIM — нарушение', () => {
    const a = buildSampleDevice({
      _id: 'device-a',
      marketingName: 'Device A',
      modelCodes: ['SM-A1'],
      aliases: ['shared alias'],
      esim: { ...buildSampleDevice().esim, support: 'supported' },
    });
    const b = buildSampleDevice({
      _id: 'device-b',
      marketingName: 'Device B',
      modelCodes: ['SM-A2'],
      aliases: ['shared alias'],
      esim: { ...buildSampleDevice().esim, support: 'not_supported' },
    });

    const result = validateCatalogInvariants([a, b]);

    expect(result.valid).toBe(false);
    expect(violationsOf('CONFLICTING_ALIAS', result)).toHaveLength(1);
  });

  it('инвариант 3: один псевдоним у двух устройств с ОДИНАКОВЫМ статусом eSIM — не нарушение (слияние 4G/5G)', () => {
    const a = buildSampleDevice({
      _id: 'device-a',
      marketingName: 'Galaxy S10',
      modelCodes: ['SM-A1'],
      aliases: ['galaxy s10'],
    });
    const b = buildSampleDevice({
      _id: 'device-b',
      marketingName: 'Galaxy S10 5G',
      modelCodes: ['SM-A2'],
      aliases: ['galaxy s10'],
    });

    const result = validateCatalogInvariants([a, b]);

    expect(violationsOf('CONFLICTING_ALIAS', result)).toHaveLength(0);
  });

  it('инвариант 4: платформа ios без screenSignatures — нарушение', () => {
    const device = buildSampleDevice({
      platform: 'ios',
      screenSignatures: [],
      os: { minVersion: '16.0', maxVersion: '18.5' },
    });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('IOS_SCREEN_SIGNATURES_MISSING', result)).toHaveLength(1);
  });

  it('инвариант 4: платформа ios без os.maxVersion — нарушение', () => {
    const device = buildSampleDevice({
      platform: 'ios',
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
      os: { minVersion: '16.0', maxVersion: null },
    });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('IOS_MAX_VERSION_MISSING', result)).toHaveLength(1);
  });

  it('инвариант 4: платформа ios с обоими полями заполненными — не нарушение', () => {
    const device = buildSampleDevice({
      platform: 'ios',
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
      os: { minVersion: '16.0', maxVersion: '18.5' },
    });

    const result = validateCatalogInvariants([device]);

    expect(result.valid).toBe(true);
  });

  it('инвариант 5: esim.support conditional без conditions — нарушение', () => {
    const device = buildSampleDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: null,
        conditions: [],
        clarifyingQuestion: {
          kind: 'region',
          question: '...',
          options: [{ value: 'yes', label: 'Да' }],
        },
        notes: '',
      },
    });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('CONDITIONAL_CONDITIONS_MISSING', result)).toHaveLength(1);
  });

  it('инвариант 5: esim.support conditional без clarifyingQuestion — нарушение', () => {
    const device = buildSampleDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: null,
        conditions: [{ scope: 'region', value: 'CN', support: 'not_supported', note: '...' }],
        clarifyingQuestion: null,
        notes: '',
      },
    });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('CONDITIONAL_CLARIFYING_QUESTION_MISSING', result)).toHaveLength(1);
  });

  it('инвариант 6: esim.support supported без sources — нарушение', () => {
    const device = buildSampleDevice({ sources: [] });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('SUPPORTED_SOURCES_MISSING', result)).toHaveLength(1);
  });

  it('инвариант 6: esim.support not_supported без sources — не нарушение', () => {
    const device = buildSampleDevice({
      sources: [],
      esim: { ...buildSampleDevice().esim, support: 'not_supported' },
    });

    const result = validateCatalogInvariants([device]);

    expect(violationsOf('SUPPORTED_SOURCES_MISSING', result)).toHaveLength(0);
  });

  it('инвариант 7: esimConsensus не совпадает с реальным согласием кандидатов — нарушение', () => {
    const supportedDevice = buildSampleDevice({
      _id: 'apple-iphone-15',
      marketingName: 'iPhone 15',
      modelCodes: [],
      aliases: [],
    });
    const notSupportedDevice = buildSampleDevice({
      _id: 'apple-iphone-x',
      marketingName: 'iPhone X',
      modelCodes: [],
      aliases: [],
      esim: { ...buildSampleDevice().esim, support: 'not_supported' },
    });
    const signature: ScreenSignatureRecord = {
      signature: '375x812@3',
      zoomed: false,
      candidates: ['apple-iphone-15', 'apple-iphone-x'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateCatalogInvariants([supportedDevice, notSupportedDevice], [signature]);

    expect(result.valid).toBe(false);
    expect(violationsOf('SCREEN_SIGNATURE_CONSENSUS_MISMATCH', result)).toHaveLength(1);
  });

  it('инвариант 7: esimConsensus "mixed" при реально расходящихся кандидатах — не нарушение', () => {
    const supportedDevice = buildSampleDevice({
      _id: 'apple-iphone-15',
      marketingName: 'iPhone 15',
      modelCodes: [],
      aliases: [],
    });
    const notSupportedDevice = buildSampleDevice({
      _id: 'apple-iphone-x',
      marketingName: 'iPhone X',
      modelCodes: [],
      aliases: [],
      esim: { ...buildSampleDevice().esim, support: 'not_supported' },
    });
    const signature: ScreenSignatureRecord = {
      signature: '375x812@3',
      zoomed: false,
      candidates: ['apple-iphone-15', 'apple-iphone-x'],
      esimConsensus: 'mixed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateCatalogInvariants([supportedDevice, notSupportedDevice], [signature]);

    expect(result.valid).toBe(true);
  });

  it('инвариант 7: сигнатура ссылается на неизвестное устройство — нарушение', () => {
    const device = buildSampleDevice({
      _id: 'apple-iphone-15',
      marketingName: 'iPhone 15',
      modelCodes: [],
      aliases: [],
    });
    const signature: ScreenSignatureRecord = {
      signature: '375x812@3',
      zoomed: false,
      candidates: ['apple-iphone-15', 'apple-iphone-unknown'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateCatalogInvariants([device], [signature]);

    expect(result.valid).toBe(false);
    expect(violationsOf('SCREEN_SIGNATURE_UNKNOWN_CANDIDATE', result)).toHaveLength(1);
  });

  it('несколько нарушений на одном справочнике собираются в единый список', () => {
    const a = buildSampleDevice({ _id: 'dup', modelCodes: ['SM-A'], sources: [] });
    const b = buildSampleDevice({ _id: 'dup', modelCodes: ['SM-B'] });

    const result = validateCatalogInvariants([a, b]);

    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});

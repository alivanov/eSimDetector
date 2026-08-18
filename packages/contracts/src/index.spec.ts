import {
  applyCatalogOverride,
  catalogOverrideSchema,
  catalogOverridePatchSchema,
  DEFAULT_CATALOG_ANSWER_POLICY,
  dataConfidenceSchema,
  deviceScreenSignatureSchema,
  deviceSchema,
  deviceSourceSchema,
  deviceStatusSchema,
  deviceTypeSchema,
  dualSimModeSchema,
  esimClarifyingOptionSchema,
  esimClarifyingQuestionSchema,
  esimConditionScopeSchema,
  esimConditionSchema,
  esimConditionSupportSchema,
  esimConsensusSchema,
  esimInfoPatchSchema,
  esimInfoSchema,
  esimSupportSchema,
  marketPresenceRuSchema,
  osVersionRangeSchema,
  parseCatalogOverride,
  parseDevice,
  parseScreenSignatureRecord,
  platformSchema,
  resultStatusSchema,
  safeParseDevice,
  screenSignatureRecordSchema,
  validateCatalogInvariants,
} from './index';
import { buildSampleDevice } from './test-fixtures';

describe('index — публичная поверхность пакета contracts', () => {
  it('экспортирует все схемы enum', () => {
    expect(platformSchema.parse('ios')).toBe('ios');
    expect(deviceTypeSchema.parse('phone')).toBe('phone');
    expect(esimSupportSchema.parse('supported')).toBe('supported');
    expect(esimConditionSupportSchema.parse('not_supported')).toBe('not_supported');
    expect(dualSimModeSchema.parse('dual-esim')).toBe('dual-esim');
    expect(esimConditionScopeSchema.parse('osVersion')).toBe('osVersion');
    expect(marketPresenceRuSchema.parse('official')).toBe('official');
    expect(dataConfidenceSchema.parse('verified')).toBe('verified');
    expect(deviceStatusSchema.parse('active')).toBe('active');
    expect(resultStatusSchema.parse('supported')).toBe('supported');
    expect(esimConsensusSchema.parse('mixed')).toBe('mixed');
  });

  it('экспортирует схемы записи устройства и функции разбора', () => {
    const sample = buildSampleDevice();

    expect(deviceSchema.parse(sample)._id).toBe(sample._id);
    expect(parseDevice(sample)._id).toBe(sample._id);
    expect(safeParseDevice(sample).success).toBe(true);
    expect(osVersionRangeSchema.parse({ minVersion: null, maxVersion: null })).toEqual({
      minVersion: null,
      maxVersion: null,
    });
    expect(
      deviceScreenSignatureSchema.parse({ cssWidth: 1, cssHeight: 1, dpr: 1, zoomed: false }),
    ).toBeDefined();
    expect(
      esimConditionSchema.parse({
        scope: 'region',
        value: 'CN',
        support: 'not_supported',
        note: '...',
      }),
    ).toBeDefined();
    expect(esimClarifyingOptionSchema.parse({ value: 'yes', label: 'Да' })).toBeDefined();
    expect(
      esimClarifyingQuestionSchema.parse({
        kind: 'region',
        question: '...',
        options: [{ value: 'yes', label: 'Да' }],
      }),
    ).toBeDefined();
    expect(esimInfoSchema.parse(sample.esim)).toBeDefined();
    expect(esimInfoPatchSchema.parse({ support: 'supported' })).toEqual({ support: 'supported' });
    expect(deviceSourceSchema.parse(sample.sources[0])).toBeDefined();
  });

  it('экспортирует схему сигнатуры экрана', () => {
    const record = parseScreenSignatureRecord({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-15'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(screenSignatureRecordSchema.parse(record)).toEqual(record);
  });

  it('экспортирует схему решений модератора и applyCatalogOverride', () => {
    const device = buildSampleDevice();
    const override = parseCatalogOverride({
      deviceId: device._id,
      patch: { dataConfidence: 'verified' },
      reason: 'проверено вручную',
      decidedBy: 'moderator',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(catalogOverridePatchSchema.parse(override.patch)).toBeDefined();
    expect(catalogOverrideSchema.parse(override)).toBeDefined();
    expect(applyCatalogOverride(device, override).dataConfidence).toBe('verified');
  });

  it('экспортирует валидацию инвариантов и политику ответов по умолчанию', () => {
    expect(validateCatalogInvariants([buildSampleDevice()]).valid).toBe(true);
    expect(DEFAULT_CATALOG_ANSWER_POLICY.allowDerivedCatalogAnswers).toBe(true);
  });
});

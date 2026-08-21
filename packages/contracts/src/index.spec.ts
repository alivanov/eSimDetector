import {
  ambiguousQueryPayloadSchema,
  applyCatalogOverride,
  catalogChangeActionSchema,
  catalogChangeEntrySchema,
  catalogOverrideSchema,
  catalogOverridePatchSchema,
  csvQuarantinePayloadSchema,
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
  moderationTaskKindSchema,
  moderationTaskSchema,
  moderationTaskStatusSchema,
  osVersionRangeSchema,
  parseCatalogChangeEntry,
  parseCatalogOverride,
  parseDevice,
  parseModerationTask,
  parseScreenSignatureRecord,
  platformSchema,
  resultStatusSchema,
  safeParseDevice,
  screenSignatureRecordSchema,
  sourceDisagreementPayloadSchema,
  sourceDisagreementVariantSchema,
  unknownModelCodePayloadSchema,
  unknownScreenSignaturePayloadSchema,
  unmatchedQueryPayloadSchema,
  userFeedbackPayloadSchema,
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

  it('экспортирует схему очереди модерации и все схемы полезной нагрузки (этап 7)', () => {
    expect(moderationTaskKindSchema.parse('unknown_model_code')).toBe('unknown_model_code');
    expect(moderationTaskStatusSchema.parse('open')).toBe('open');
    expect(
      unknownModelCodePayloadSchema.parse({
        code: 'SM-S9280',
        platform: 'android',
        brandGuess: 'samsung',
      }),
    ).toBeDefined();
    expect(
      unknownScreenSignaturePayloadSchema.parse({
        signature: '393x852@3',
        cssWidth: 393,
        cssHeight: 852,
        dpr: 3,
        zoomed: false,
        osVersion: null,
      }),
    ).toBeDefined();
    expect(
      unmatchedQueryPayloadSchema.parse({ rawQuery: 'айфон', normalizedQuery: 'iphone' }),
    ).toBeDefined();
    expect(
      ambiguousQueryPayloadSchema.parse({
        rawQuery: 'galaxy s23',
        normalizedQuery: 'galaxy s23',
        candidateIds: ['samsung-galaxy-s23'],
      }),
    ).toBeDefined();
    expect(
      csvQuarantinePayloadSchema.parse({
        code: 'CODE_COLLISION',
        source: 'gpt-5-6-luna',
        batchId: '01',
        lineNumber: 12,
        detail: 'дублирующийся сервисный код',
      }),
    ).toBeDefined();
    expect(
      sourceDisagreementVariantSchema.parse({ source: 'gpt-5-6-luna', esimSupport: 'yes' }),
    ).toBeDefined();
    expect(
      sourceDisagreementPayloadSchema.parse({
        deviceId: 'samsung-galaxy-a54',
        variants: [{ source: 'gpt-5-6-luna', esimSupport: 'yes' }],
      }),
    ).toBeDefined();
    expect(
      userFeedbackPayloadSchema.parse({
        requestId: 'req-1',
        reportedStatus: 'supported',
        deviceId: null,
        comment: 'неверно',
        signalsSummary: null,
      }),
    ).toBeDefined();

    const task = parseModerationTask({
      _id: 'task-1',
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: null },
      occurrences: 1,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    });
    expect(moderationTaskSchema.parse(task)).toEqual(task);
  });

  it('экспортирует схему журнала изменений справочника (этап 7)', () => {
    expect(catalogChangeActionSchema.parse('link_model_code')).toBe('link_model_code');
    const entry = parseCatalogChangeEntry({
      _id: 'change-1',
      deviceId: 'samsung-galaxy-s24-ultra',
      taskId: 'task-1',
      action: 'link_model_code',
      field: 'modelCodes',
      previousValue: [],
      newValue: ['SM-S9280'],
      reason: 'источник',
      decidedBy: 'moderator-1',
      createdAt: new Date(),
    });
    expect(catalogChangeEntrySchema.parse(entry)).toEqual(entry);
  });
});

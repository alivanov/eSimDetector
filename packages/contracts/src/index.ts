export type {
  Platform,
  DeviceType,
  EsimSupport,
  EsimConditionSupport,
  DualSimMode,
  EsimConditionScope,
  MarketPresenceRu,
  DataConfidence,
  DeviceStatus,
  ResultStatus,
  EsimConsensus,
} from './enums';
export {
  platformSchema,
  deviceTypeSchema,
  esimSupportSchema,
  esimConditionSupportSchema,
  dualSimModeSchema,
  esimConditionScopeSchema,
  marketPresenceRuSchema,
  dataConfidenceSchema,
  deviceStatusSchema,
  resultStatusSchema,
  esimConsensusSchema,
} from './enums';

export type {
  OsVersionRange,
  DeviceScreenSignature,
  EsimCondition,
  EsimClarifyingOption,
  EsimClarifyingQuestion,
  EsimInfo,
  DeviceSource,
  DeviceProvenance,
  Device,
  ParseDeviceResult,
} from './device.schema';
export {
  osVersionRangeSchema,
  deviceScreenSignatureSchema,
  esimConditionSchema,
  esimClarifyingOptionSchema,
  esimClarifyingQuestionSchema,
  esimInfoSchema,
  deviceSourceSchema,
  deviceProvenanceSchema,
  deviceSchema,
  parseDevice,
  safeParseDevice,
} from './device.schema';

export type { ScreenSignatureRecord } from './screen-signature.schema';
export { screenSignatureRecordSchema, parseScreenSignatureRecord } from './screen-signature.schema';

export type {
  EsimInfoPatch,
  CatalogOverridePatch,
  CatalogOverride,
} from './catalog-override.schema';
export {
  esimInfoPatchSchema,
  catalogOverridePatchSchema,
  catalogOverrideSchema,
  parseCatalogOverride,
  applyCatalogOverride,
} from './catalog-override.schema';

export type {
  CatalogInvariantNumber,
  CatalogInvariantCode,
  CatalogInvariantViolation,
  CatalogValidationResult,
} from './invariants';
export { validateCatalogInvariants } from './invariants';

export type {
  EsimReasonCode,
  EsimReason,
  EsimResolutionContext,
  ConditionResolution,
  CatalogAnswerPolicy,
  EsimResolution,
} from './esim-resolution';
export { DEFAULT_CATALOG_ANSWER_POLICY } from './esim-resolution';

/**
 * Помощник тестов (не только этого пакета — `CatalogModule`, будущие `matching`/`detection`,
 * `tools/seed`), а не часть контракта API: строит валидную запись `Device` для фикстур, не
 * заставляя каждый потребитель заново перечислять все поля §5.3.
 */
export { buildSampleDevice } from './test-fixtures';

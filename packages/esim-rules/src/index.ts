export type { AppleModelIdentity, AppleGenerationRuleResult } from './apple-generation-rule';
export { resolveAppleGenerationRule } from './apple-generation-rule';

export { resolveEsimConditions } from './conditions';

export type { ConfidenceGateResult } from './confidence-gate';
export { applyDataConfidenceGate } from './confidence-gate';

export type {
  FamilyEsimAggregateStatus,
  FamilyEsimRule,
  FamilyRuleResolution,
} from './family-rule';
export { resolveFamilyRuleEsimStatus } from './family-rule';

export type { EsimResolvableDevice } from './resolve-device-esim-status';
export { resolveDeviceEsimStatus } from './resolve-device-esim-status';

export type { CandidateGroupResolution } from './group-consensus';
export { resolveCandidateGroupEsimStatus } from './group-consensus';

/**
 * Реэкспорт типов результата из `@esim-detector/contracts` (симметрично `QuerySlots` в
 * `fuzzy-matcher`, ADR-019/ADR-011) — потребителям этого пакета не нужно знать, что
 * канонический тип результата объявлен в другом пакете.
 */
export type {
  ResultStatus,
  EsimReasonCode,
  EsimReason,
  EsimResolutionContext,
  ConditionResolution,
  CatalogAnswerPolicy,
  EsimResolution,
} from '@esim-detector/contracts';
export { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

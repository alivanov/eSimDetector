export type { MatcherDevice, QuerySlots } from './types';

export { damerauLevenshteinDistance, editSimilarity } from './distance/levenshtein';

export type { JaroWinklerOptions } from './distance/jaro-winkler';
export { jaroSimilarity, jaroWinklerSimilarity } from './distance/jaro-winkler';

export { extractTrigrams, trigramSimilarity } from './trigram/trigrams';

export type { TrigramIndex, FindTrigramCandidatesOptions } from './trigram/inverted-index';
export {
  buildDeviceTrigramKey,
  buildTrigramIndex,
  findTrigramCandidates,
} from './trigram/inverted-index';

export type { AliasIndex, AliasCollision, ModelCodeCollision } from './exact-index';
export { buildAliasIndex, lookupAlias, lookupModelCode } from './exact-index';

export type {
  ConstraintRejectionCode,
  ConstraintRejection,
  ConstraintOptions,
} from './constraints';
export { rejectCandidate, computeBrandSimilarity, isStricterVariantThanQuery } from './constraints';

export type {
  ScoringWeights,
  MatchScoreBreakdown,
  ScoredCandidate,
  ScoreCandidateOptions,
} from './scoring';
export { DEFAULT_SCORING_WEIGHTS, scoreCandidate, buildComparableQueryText } from './scoring';

export { rankCandidates } from './ranking';

export type {
  DecisionStatus,
  DecisionReasonCode,
  DecisionThresholds,
  DecisionOptions,
  Decision,
} from './decision';
export { DEFAULT_DECISION_THRESHOLDS, decide } from './decision';

export type {
  RetrievalReasonCode,
  MatchReasonCode,
  MatchIndex,
  RejectedCandidate,
  MatchDecision,
  MatchOptions,
} from './match';
export { buildMatchIndex, matchQuery } from './match';

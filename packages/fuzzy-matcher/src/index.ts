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

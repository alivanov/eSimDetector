export type {
  SynonymDictionary,
  CharacterMappingTable,
  InsignificantAttributeDictionary,
  NormalizationDictionary,
  QueryAttributes,
  NormalizationStepId,
  NormalizationTraceStep,
  NormalizationTrace,
  QuerySlots,
  NormalizeQueryOptions,
  NormalizedQuery,
} from './types';

export type {
  NormalizationDictionaryParseError,
  NormalizationDictionaryParseResult,
} from './dictionary';
export { parseNormalizationDictionary } from './dictionary';

export { foldCase, normalizeUnicode, unifyLookalikes } from './unicode';
export { unifySeparators, collapseWhitespace, stripPunctuation } from './separators';
export { splitLettersAndDigits } from './split-letters-digits';
export { mapCyrillicToLatinLayout, correctKeyboardLayout } from './keyboard-layout';
export { transliterateCyrillic } from './transliterate';
export { expandSynonyms } from './synonyms';
export { tokenize } from './tokenize';

export type { AttributeExtractionResult } from './attributes';
export { extractAttributes } from './attributes';
export { detectModelCode } from './model-code';
export { parseSlots } from './slots';
export { normalizeQuery } from './normalize-query';

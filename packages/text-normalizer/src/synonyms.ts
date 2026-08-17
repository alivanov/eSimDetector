import type { NormalizationDictionary } from './types';

/**
 * Раскрытие синонимов и сокращений (docs/04-matching-algorithm.md, §4.4): `нот` → `note`,
 * `с23` → `s23`, `макс` → `max`, `s23u` → `galaxy s23 ultra`.
 *
 * В конвейере этот шаг должен выполняться раньше транслитерации (см. transliterate.ts) —
 * иначе устоявшиеся написания вроде `айфон` не дойдут до словаря уже испорченными.
 */
export function expandSynonyms(
  tokens: readonly string[],
  dictionary: NormalizationDictionary,
): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    const expansion = dictionary.synonyms[token.toLowerCase()];
    if (expansion === undefined) {
      result.push(token);
    } else {
      result.push(...expansion);
    }
  }
  return result;
}

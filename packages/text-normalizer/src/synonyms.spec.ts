import type { NormalizationDictionary } from './types';
import { expandSynonyms } from './synonyms';

function buildDictionary(
  synonyms: NormalizationDictionary['synonyms'] = {},
): NormalizationDictionary {
  return {
    synonyms,
    transliteration: {},
    keyboardLayout: {},
    insignificantAttributes: {
      storagePatterns: [],
      colors: [],
      networkMarkers: [],
      dualSimMarkers: [],
    },
    stopWords: [],
  };
}

describe('expandSynonyms', () => {
  it('docs/04 §4.4: раскрывает синонимы и сокращения "нот", "с23", "макс"', () => {
    const dictionary = buildDictionary({
      нот: ['note'],
      с23: ['s23'],
      макс: ['max'],
    });

    expect(expandSynonyms(['нот', 'с23', 'макс'], dictionary)).toEqual(['note', 's23', 'max']);
  });

  it('раскрывает один токен в несколько ("s23u" → "galaxy s23 ultra")', () => {
    const dictionary = buildDictionary({ s23u: ['galaxy', 's23', 'ultra'] });

    expect(expandSynonyms(['s23u'], dictionary)).toEqual(['galaxy', 's23', 'ultra']);
  });

  it('оставляет токен без изменений, если для него нет записи в словаре', () => {
    const dictionary = buildDictionary({ нот: ['note'] });

    expect(expandSynonyms(['iphone'], dictionary)).toEqual(['iphone']);
  });

  it('ищет запись без учёта регистра токена', () => {
    const dictionary = buildDictionary({ нот: ['note'] });

    expect(expandSynonyms(['НОТ'], dictionary)).toEqual(['note']);
  });

  it('сохраняет порядок токенов при смешанном раскрытии', () => {
    const dictionary = buildDictionary({ про: ['pro'] });

    expect(expandSynonyms(['iphone', '13', 'про'], dictionary)).toEqual(['iphone', '13', 'pro']);
  });

  it('на пустом списке токенов возвращает пустой список', () => {
    expect(expandSynonyms([], buildDictionary())).toEqual([]);
  });
});

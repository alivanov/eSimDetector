import {
  parseNormalizationDictionary,
  foldCase,
  normalizeUnicode,
  unifyLookalikes,
  unifySeparators,
  collapseWhitespace,
  stripPunctuation,
  splitLettersAndDigits,
  mapCyrillicToLatinLayout,
  correctKeyboardLayout,
  transliterateCyrillic,
  expandSynonyms,
  tokenize,
} from './index';

describe('index — публичная поверхность пакета', () => {
  it('экспортирует все функции нормализации', () => {
    expect(foldCase('А')).toBe('а');
    expect(normalizeUnicode('a')).toBe('a');
    expect(unifyLookalikes('s23')).toBe('s23');
    expect(unifySeparators('a-b')).toBe('a b');
    expect(collapseWhitespace('a  b')).toBe('a b');
    expect(stripPunctuation('a!')).toBe('a');
    expect(splitLettersAndDigits('a1')).toBe('a 1');
    expect(mapCyrillicToLatinLayout('a', {})).toBe('a');
    expect(tokenize('a b')).toEqual(['a', 'b']);
    expect(expandSynonyms(['a'], emptyDictionary())).toEqual(['a']);
    expect(transliterateCyrillic('a', {})).toBe('a');
    expect(correctKeyboardLayout('a', emptyDictionary())).toBe('a');

    const parsed = parseNormalizationDictionary({
      synonyms: {},
      transliteration: {},
      keyboardLayout: {},
      insignificantAttributes: {
        storagePatterns: [],
        colors: [],
        networkMarkers: [],
        dualSimMarkers: [],
      },
      stopWords: [],
    });
    expect(parsed.ok).toBe(true);
  });
});

function emptyDictionary(): Parameters<typeof expandSynonyms>[1] {
  return {
    synonyms: {},
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

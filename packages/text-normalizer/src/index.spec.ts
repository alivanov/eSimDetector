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
  extractAttributes,
  detectModelCode,
  parseSlots,
  normalizeQuery,
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

  it('экспортирует слотовый разбор и конвейер нормализации (детально проверены в собственных спек-файлах)', () => {
    expect(extractAttributes(['iphone'], emptyDictionary()).remainingTokens).toEqual(['iphone']);
    expect(detectModelCode('SM-S928B')).toBe('SM-S928B');
    expect(parseSlots(['iphone', '13'], emptyDictionary()).generation).toBe(13);
    expect(normalizeQuery('iphone 13', emptyDictionary()).slots.generation).toBe(13);
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

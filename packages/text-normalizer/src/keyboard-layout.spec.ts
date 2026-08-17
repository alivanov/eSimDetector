import type { NormalizationDictionary } from './types';
import { mapCyrillicToLatinLayout, correctKeyboardLayout } from './keyboard-layout';

const KEYBOARD_LAYOUT: NormalizationDictionary['keyboardLayout'] = {
  й: 'q',
  ц: 'w',
  у: 'e',
  к: 'r',
  е: 't',
  н: 'y',
  г: 'u',
  ш: 'i',
  щ: 'o',
  з: 'p',
  ф: 'a',
  ы: 's',
  в: 'd',
  а: 'f',
  п: 'g',
  р: 'h',
  о: 'j',
  л: 'k',
  д: 'l',
  я: 'z',
  ч: 'x',
  с: 'c',
  м: 'v',
  и: 'b',
  т: 'n',
  ь: 'm',
};

function buildDictionary(): NormalizationDictionary {
  return {
    synonyms: {
      самсунг: ['samsung'],
      айфон: ['iphone'],
    },
    transliteration: {},
    keyboardLayout: KEYBOARD_LAYOUT,
    insignificantAttributes: {
      storagePatterns: [],
      colors: [],
      networkMarkers: [],
      dualSimMarkers: [],
    },
    stopWords: [],
  };
}

describe('mapCyrillicToLatinLayout', () => {
  it('docs/04 §4.4: отображает кириллицу, набранную в русской раскладке, в клавиши QWERTY', () => {
    // "ыфьыгтп" — это "samsung", набранный по-русски на английский манер (посимвольно
    // через физическое положение клавиш ЙЦУКЕН↔QWERTY).
    expect(mapCyrillicToLatinLayout('ыфьыгтп', KEYBOARD_LAYOUT)).toBe('samsung');
  });

  it('пропускает символы вне таблицы без изменений', () => {
    expect(mapCyrillicToLatinLayout('abc 123', KEYBOARD_LAYOUT)).toBe('abc 123');
  });

  it('отображает произвольный кириллический текст посимвольно', () => {
    expect(mapCyrillicToLatinLayout('привет', KEYBOARD_LAYOUT)).toBe('ghbdtn');
  });
});

describe('correctKeyboardLayout', () => {
  it('исправляет раскладку, когда результат подтверждён словарём синонимов', () => {
    expect(correctKeyboardLayout('ыфьыгтп', buildDictionary())).toBe('samsung');
  });

  it('не исправляет раскладку без подтверждения словарём (нет ложных срабатываний)', () => {
    expect(correctKeyboardLayout('привет', buildDictionary())).toBe('привет');
  });

  it('не трогает слова, не состоящие полностью из кириллицы', () => {
    expect(correctKeyboardLayout('iphone 23', buildDictionary())).toBe('iphone 23');
  });

  it('обрабатывает несколько слов независимо', () => {
    expect(correctKeyboardLayout('ыфьыгтп 23', buildDictionary())).toBe('samsung 23');
  });
});

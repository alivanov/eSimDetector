import type { NormalizationDictionary } from './types';
import { transliterateCyrillic } from './transliterate';

const TRANSLITERATION: NormalizationDictionary['transliteration'] = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

describe('transliterateCyrillic', () => {
  it('docs/04 §4.4: транслитерирует "самсунг" в "samsung"', () => {
    expect(transliterateCyrillic('самсунг', TRANSLITERATION)).toBe('samsung');
  });

  it('ADR-018: "айфон" транслитерируется в "ajfon", а не в "iphone"', () => {
    // Это и есть обоснование ADR-018: транслитератор общего назначения не решает нашу
    // задачу распознавания брендов — отображение "айфон" → "iphone" выполняет только
    // словарь синонимов (см. synonyms.spec.ts), причём раньше транслитерации в конвейере.
    expect(transliterateCyrillic('айфон', TRANSLITERATION)).toBe('ajfon');
  });

  it('ADR-018: "сяоми" транслитерируется в "syaomi"', () => {
    expect(transliterateCyrillic('сяоми', TRANSLITERATION)).toBe('syaomi');
  });

  it('ADR-018: "хонор" транслитерируется в "khonor"', () => {
    expect(transliterateCyrillic('хонор', TRANSLITERATION)).toBe('khonor');
  });

  it('отображает твёрдый и мягкий знак в пустую строку', () => {
    expect(transliterateCyrillic('мать', TRANSLITERATION)).toBe('mat');
  });

  it('не трогает латиницу, цифры и пробелы', () => {
    expect(transliterateCyrillic('iphone 13', TRANSLITERATION)).toBe('iphone 13');
  });

  it('учитывает регистр входных символов', () => {
    expect(transliterateCyrillic('Самсунг', TRANSLITERATION)).toBe('samsung');
  });
});

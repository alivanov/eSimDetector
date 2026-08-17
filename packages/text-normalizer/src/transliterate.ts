import type { NormalizationDictionary } from './types';

/**
 * Транслитерация кириллицы в латиницу (docs/04-matching-algorithm.md, §4.4) по таблице
 * из словаря нормализации. Это резервный шаг для остатка, не распознанного словарём
 * синонимов: в конвейере он должен выполняться после раскрытия синонимов, а не до —
 * иначе `айфон` превратится в `ajfon` и уже не найдётся в словаре как псевдоним `iphone`.
 */
export function transliterateCyrillic(
  input: string,
  table: NormalizationDictionary['transliteration'],
): string {
  let result = '';
  for (const char of input) {
    const mapped = table[char.toLowerCase()];
    result += mapped ?? char;
  }
  return result;
}

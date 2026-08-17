import aliasesJson from '../../../data/catalog/aliases.json';

import { parseNormalizationDictionary } from './dictionary';

/**
 * Проверяет, что `data/catalog/aliases.json` — валидный словарь нормализации.
 *
 * Импорт JSON здесь — конструкция компилятора (`resolveJsonModule`, разрешается на этапе
 * сборки/запуска тестов через встроенный резолвер Jest), а не вызов `node:fs` из кода
 * пакета: сами модули пакета (`src/*.ts`, кроме тестов) файл не читают и словарь всегда
 * получают параметром — это единственное отступление от правила "словарь в тестах —
 * встроенный литерал", сделанное специально для проверки готовности данных.
 */
describe('data/catalog/aliases.json', () => {
  it('проходит parseNormalizationDictionary без ошибок', () => {
    const result = parseNormalizationDictionary(aliasesJson);

    if (!result.ok) {
      throw new Error(
        `data/catalog/aliases.json не прошёл валидацию: ${JSON.stringify(result.errors)}`,
      );
    }

    expect(result.ok).toBe(true);
    expect(Object.keys(result.value.synonyms).length).toBeGreaterThan(0);
    expect(Object.keys(result.value.transliteration).length).toBeGreaterThan(0);
    expect(Object.keys(result.value.keyboardLayout).length).toBeGreaterThan(0);
    expect(result.value.stopWords.length).toBeGreaterThan(0);
  });
});

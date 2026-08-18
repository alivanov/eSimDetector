import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { parseNormalizationDictionary } from '@esim-detector/text-normalizer';
import type { Provider } from '@nestjs/common';

import { REPO_ROOT } from '../../../common/repo-root';

/**
 * Токен DI словаря нормализации (docs/04-matching-algorithm.md, §4.4/§4.5.1). Пакет
 * `text-normalizer` не читает `data/catalog/aliases.json` сам (ADR-019: словарь приходит
 * параметром) — разбор файла выполняет вызывающий код, здесь это единственное место в
 * `apps/api`, а не каждый вызов `normalizeQuery` по отдельности.
 */
export const NORMALIZATION_DICTIONARY = Symbol('NORMALIZATION_DICTIONARY');

export function loadNormalizationDictionaryFromFile(filePath: string): NormalizationDictionary {
  const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
  const result = parseNormalizationDictionary(raw);
  if (!result.ok) {
    const issues = result.errors.map((error) => `  ${error.path || '(корень)'}: ${error.message}`);
    throw new Error(
      `Словарь нормализации "${filePath}" не соответствует ожидаемой форме:\n${issues.join('\n')}`,
    );
  }
  return result.value;
}

export const DEFAULT_ALIASES_PATH = join(REPO_ROOT, 'data/catalog/aliases.json');

/**
 * Загружается один раз при старте приложения (не на каждый запрос) — словарь неизменен на
 * протяжении жизни процесса, как и индексы `CatalogService` (ADR-005).
 */
export const normalizationDictionaryProvider: Provider = {
  provide: NORMALIZATION_DICTIONARY,
  useFactory: (): NormalizationDictionary =>
    loadNormalizationDictionaryFromFile(DEFAULT_ALIASES_PATH),
};

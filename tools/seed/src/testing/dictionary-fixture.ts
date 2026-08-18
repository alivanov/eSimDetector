import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { parseNormalizationDictionary } from '@esim-detector/text-normalizer';

/**
 * Загружает НАСТОЯЩИЙ `data/catalog/aliases.json` для тестов (а не собственную тестовую
 * фикстуру) — конвейер импорта обязан работать с тем же словарём, что и пользовательский ввод
 * (docs/14-catalog-ingestion.md §14.4 шаг 2), поэтому тест на выдуманном словаре не защищал бы
 * от расхождения. Разбор проходит `parseNormalizationDictionary` (ADR-016: без `as`).
 */
export function loadRealDictionary(): NormalizationDictionary {
  const path = join(__dirname, '../../../../data/catalog/aliases.json');
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  const result = parseNormalizationDictionary(raw);
  if (!result.ok) {
    throw new Error(`data/catalog/aliases.json не прошёл валидацию: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

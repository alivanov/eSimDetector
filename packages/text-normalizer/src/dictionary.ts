import type { InsignificantAttributeDictionary, NormalizationDictionary } from './types';

/**
 * Разбор словаря нормализации из недоверенных внешних данных (ADR-016): значение приходит
 * как `unknown` (результат `JSON.parse` над `data/catalog/aliases.json` либо иным источником)
 * и получает тип предметной области только после ручной проверки формы, без утверждений `as`.
 */

export interface NormalizationDictionaryParseError {
  readonly path: string;
  readonly message: string;
}

export type NormalizationDictionaryParseResult =
  | { readonly ok: true; readonly value: NormalizationDictionary }
  | { readonly ok: false; readonly errors: readonly NormalizationDictionaryParseError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function parseStringMap(
  value: unknown,
  fieldPath: string,
  errors: NormalizationDictionaryParseError[],
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    errors.push({ path: fieldPath, message: 'ожидался объект вида "строка → строка"' });
    return undefined;
  }

  const result: Record<string, string> = {};
  let valid = true;
  for (const [key, entryValue] of Object.entries(value)) {
    if (key.trim().length === 0) {
      errors.push({ path: `${fieldPath}`, message: 'ключ не может быть пустой строкой' });
      valid = false;
      continue;
    }
    if (!isString(entryValue)) {
      errors.push({ path: `${fieldPath}.${key}`, message: 'значение должно быть строкой' });
      valid = false;
      continue;
    }
    result[key] = entryValue;
  }

  return valid ? result : undefined;
}

function parseSynonyms(
  value: unknown,
  errors: NormalizationDictionaryParseError[],
): Record<string, readonly string[]> | undefined {
  if (!isRecord(value)) {
    errors.push({ path: 'synonyms', message: 'ожидался объект вида "токен → список токенов"' });
    return undefined;
  }

  const result: Record<string, readonly string[]> = {};
  let valid = true;
  for (const [key, entryValue] of Object.entries(value)) {
    if (key.trim().length === 0) {
      errors.push({ path: 'synonyms', message: 'ключ не может быть пустой строкой' });
      valid = false;
      continue;
    }
    if (!isStringArray(entryValue) || entryValue.length === 0) {
      errors.push({
        path: `synonyms.${key}`,
        message: 'значение должно быть непустым списком строк',
      });
      valid = false;
      continue;
    }
    if (entryValue.some((token) => token.trim().length === 0)) {
      errors.push({ path: `synonyms.${key}`, message: 'токен раскрытия не может быть пустым' });
      valid = false;
      continue;
    }
    result[key] = entryValue;
  }

  return valid ? result : undefined;
}

function parseStringArrayField(
  value: unknown,
  fieldPath: string,
  errors: NormalizationDictionaryParseError[],
): string[] | undefined {
  if (!isStringArray(value)) {
    errors.push({ path: fieldPath, message: 'ожидался список строк' });
    return undefined;
  }
  return value;
}

function parseInsignificantAttributes(
  value: unknown,
  errors: NormalizationDictionaryParseError[],
): InsignificantAttributeDictionary | undefined {
  if (!isRecord(value)) {
    errors.push({ path: 'insignificantAttributes', message: 'ожидался объект' });
    return undefined;
  }

  const storagePatterns = parseStringArrayField(
    value['storagePatterns'],
    'insignificantAttributes.storagePatterns',
    errors,
  );
  const colors = parseStringArrayField(value['colors'], 'insignificantAttributes.colors', errors);
  const networkMarkers = parseStringArrayField(
    value['networkMarkers'],
    'insignificantAttributes.networkMarkers',
    errors,
  );
  const dualSimMarkers = parseStringArrayField(
    value['dualSimMarkers'],
    'insignificantAttributes.dualSimMarkers',
    errors,
  );

  if (
    storagePatterns === undefined ||
    colors === undefined ||
    networkMarkers === undefined ||
    dualSimMarkers === undefined
  ) {
    return undefined;
  }

  return { storagePatterns, colors, networkMarkers, dualSimMarkers };
}

export function parseNormalizationDictionary(value: unknown): NormalizationDictionaryParseResult {
  const errors: NormalizationDictionaryParseError[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'словарь нормализации должен быть объектом' }],
    };
  }

  const synonyms = parseSynonyms(value['synonyms'], errors);
  const transliteration = parseStringMap(value['transliteration'], 'transliteration', errors);
  const keyboardLayout = parseStringMap(value['keyboardLayout'], 'keyboardLayout', errors);
  const insignificantAttributes = parseInsignificantAttributes(
    value['insignificantAttributes'],
    errors,
  );
  const stopWords = parseStringArrayField(value['stopWords'], 'stopWords', errors);

  if (
    synonyms === undefined ||
    transliteration === undefined ||
    keyboardLayout === undefined ||
    insignificantAttributes === undefined ||
    stopWords === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { synonyms, transliteration, keyboardLayout, insignificantAttributes, stopWords },
  };
}

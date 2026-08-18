/**
 * Разбор и применение `data/catalog/code-patterns.json` (docs/14-catalog-ingestion.md §14.3) —
 * шаблоны сервисных кодов по вендорам. Файл — внешние данные (ADR-016): значение приходит как
 * `unknown` и проверяется вручную, без утверждений `as`.
 */

export type CodePatternMap = ReadonlyMap<string, RegExp>;

export interface CodePatternParseResult {
  readonly patterns: CodePatternMap;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ключи, начинающиеся с "_", — метаданные файла (`_comment`), а не шаблон бренда. */
function isMetaKey(key: string): boolean {
  return key.startsWith('_');
}

export function parseCodePatterns(value: unknown): CodePatternParseResult {
  if (!isRecord(value)) {
    return { patterns: new Map(), errors: ['data/catalog/code-patterns.json: ожидался объект'] };
  }

  const patterns = new Map<string, RegExp>();
  const errors: string[] = [];
  for (const [key, patternValue] of Object.entries(value)) {
    if (isMetaKey(key)) {
      continue;
    }
    if (typeof patternValue !== 'string') {
      errors.push(`code-patterns.json["${key}"]: ожидалась строка регулярного выражения`);
      continue;
    }
    try {
      patterns.set(key.toLowerCase(), new RegExp(patternValue));
    } catch {
      errors.push(
        `code-patterns.json["${key}"]: невалидное регулярное выражение "${patternValue}"`,
      );
    }
  }

  return { patterns, errors };
}

export type ModelCodeValidation =
  | { readonly valid: true }
  /** Бренд не имеет подтверждённого шаблона в файле — код не проверяется (docs/14 §14.3: пробел, а не ошибка). */
  | { readonly valid: 'no-pattern' }
  | { readonly valid: false };

/** Проверяет один сервисный код по шаблону вендора (`CODE_PATTERN_INVALID`, docs/14 §14.3). */
export function validateModelCode(
  brand: string,
  code: string,
  patterns: CodePatternMap,
): ModelCodeValidation {
  const pattern = patterns.get(brand.toLowerCase());
  if (pattern === undefined) {
    return { valid: 'no-pattern' };
  }
  return pattern.test(code.trim()) ? { valid: true } : { valid: false };
}

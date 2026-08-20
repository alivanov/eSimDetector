import type { DesignTokens, TokenGroup, TokenLeaf } from './types';

const CSS_VARIABLE_PREFIX = '--esim';

function isTokenGroup(value: TokenLeaf | TokenGroup): value is TokenGroup {
  return typeof value === 'object';
}

/** `spinnerDuration` → `spinner-duration`; уже дефисированные сегменты (`xxl`) не трогает. */
function camelToKebabCase(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function toVariableName(path: readonly string[]): string {
  return [CSS_VARIABLE_PREFIX, ...path.map(camelToKebabCase)].join('-');
}

/**
 * Обходит дерево токенов и возвращает плоскую карту «имя переменной → значение». Порядок
 * ключей — порядок обхода `Object.entries`, то есть порядок объявления в `./tokens.ts`;
 * `generateCssVariablesText` печатает их в этом же порядке для воспроизводимого вывода.
 */
export function flattenTokens(
  group: TokenGroup,
  parentPath: readonly string[] = [],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(group)) {
    const path = [...parentPath, key];
    if (isTokenGroup(value)) {
      for (const [nestedName, nestedValue] of flattenTokens(value, path)) {
        result.set(nestedName, nestedValue);
      }
    } else {
      result.set(toVariableName(path), value);
    }
  }
  return result;
}

/**
 * Строка объявлений CSS-переменных (без обёртывающего селектора) — виджету (`apps/widget`,
 * этап 6.3) она нужна для вставки внутрь теневого DOM, где селектор `:host` или `:root`
 * добавляется на стороне вызывающего кода, а не здесь.
 */
export function generateCssVariablesText(tokens: DesignTokens): string {
  const flat = flattenTokens(tokens);
  return Array.from(flat.entries())
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

/** Готовый блок с селектором — для демонстрационного приложения (`apps/web`), где теневого DOM нет. */
export function generateCssVariablesBlock(tokens: DesignTokens, selector = ':root'): string {
  return `${selector} {\n${generateCssVariablesText(tokens)}\n}\n`;
}

/**
 * Унификация разделителей и удаление служебных символов (docs/04-matching-algorithm.md,
 * §4.4, вторая и третья строки таблицы).
 */

/** Дефисы (в т.ч. неразрывные и типографские), подчёркивания, точки, кавычки, слэши. */
const SEPARATOR_PATTERN = /[-\u2010\u2011\u2012\u2013\u2014_./\\'"`’‘“”,]+/g;

/** Заменяет разделители (дефисы, подчёркивания, точки, кавычки) на пробел. */
export function unifySeparators(input: string): string {
  return input.replace(SEPARATOR_PATTERN, ' ');
}

/** Свёртывает повторяющиеся пробелы в один и обрезает пробелы по краям строки. */
export function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * Удаляет служебные символы (пунктуацию, эмодзи, прочие символы), оставляя буквы
 * любого алфавита, цифры и пробелы.
 */
export function stripPunctuation(input: string): string {
  return input.replace(/[^\p{L}\p{N}\s]/gu, '');
}

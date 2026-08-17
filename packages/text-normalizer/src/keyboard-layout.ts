import type { NormalizationDictionary } from './types';

/**
 * Исправление неверной раскладки клавиатуры (docs/04-matching-algorithm.md, §4.4 и §4.4
 * "Исправление раскладки"): `ыфьыгтп`, набранное по-русски на английский манер, на самом
 * деле означает `samsung`.
 */

/** Отображает каждый кириллический символ входа в соответствующую клавишу QWERTY. */
export function mapCyrillicToLatinLayout(
  input: string,
  layout: NormalizationDictionary['keyboardLayout'],
): string {
  let result = '';
  for (const char of input) {
    const mapped = layout[char];
    result += mapped ?? char;
  }
  return result;
}

function isFullyCyrillicWord(word: string): boolean {
  return word.length > 0 && /^[а-яёА-ЯЁ]+$/.test(word);
}

/**
 * Множество токенов, которые словарь синонимов считает каноническими: ключи (написания,
 * которые словарь распознаёт) и значения (то, во что они раскрываются). Раскладка
 * подтверждена, только если получившееся слово входит в это множество.
 */
function buildKnownTokens(dictionary: NormalizationDictionary): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const key of Object.keys(dictionary.synonyms)) {
    tokens.add(key);
  }
  for (const expansions of Object.values(dictionary.synonyms)) {
    for (const token of expansions) {
      tokens.add(token);
    }
  }
  return tokens;
}

/**
 * Исправляет раскладку только для слов, полностью состоящих из кириллицы, и только если
 * результат подтверждён словарём синонимов. Без подтверждения слово возвращается как есть —
 * это исключает ложные срабатывания на обычном кириллическом тексте (docs/04 §4.4).
 */
export function correctKeyboardLayout(input: string, dictionary: NormalizationDictionary): string {
  const knownTokens = buildKnownTokens(dictionary);

  return input
    .split(' ')
    .map((word) => {
      if (!isFullyCyrillicWord(word)) {
        return word;
      }
      const converted = mapCyrillicToLatinLayout(word.toLowerCase(), dictionary.keyboardLayout);
      return knownTokens.has(converted) ? converted : word;
    })
    .join(' ');
}

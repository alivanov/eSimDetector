import type { NormalizationDictionary } from './types';

/**
 * Раскрытие синонимов и сокращений (docs/04-matching-algorithm.md, §4.4): `нот` → `note`,
 * `с23` → `s23`, `макс` → `max`, `s23u` → `galaxy s23 ultra`.
 *
 * В конвейере этот шаг должен выполняться раньше транслитерации (см. transliterate.ts) —
 * иначе устоявшиеся написания вроде `айфон` не дойдут до словаря уже испорченными.
 */
export function expandSynonyms(
  tokens: readonly string[],
  dictionary: NormalizationDictionary,
): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    const expansion = dictionary.synonyms[token.toLowerCase()];
    if (expansion === undefined) {
      result.push(token);
    } else {
      result.push(...expansion);
    }
  }
  return result;
}

/** Токен, в котором вперемешку встречаются и буквы, и цифры (`s23u`, `с24`, но не `note` и не `23`). */
function isMixedAlphanumeric(token: string): boolean {
  return /\p{L}/u.test(token) && /\p{Nd}/u.test(token);
}

/**
 * Раскрывает составные буквенно-цифровые сокращения словаря (`s23u` → `galaxy s23 ultra`,
 * `с23` → `s23`) ДО разделения букв и цифр (`splitLettersAndDigits`), а не вместе с основным
 * проходом `expandSynonyms` в общем конвейере (docs/04 §4.10.1, находка агента 2.5).
 *
 * Причина существования отдельного прохода: `splitLettersAndDigits` режет токен по границе
 * "буква ↔ цифра" РАНЬШЕ, чем основной проход `expandSynonyms` в `normalizeQuery` успевает
 * увидеть его целиком (он выполняется уже после токенизации и раскладки клавиатуры) — поэтому
 * составные сокращения вида `s23u` были недостижимы: словарь искал ключ `s23u`, а видел уже
 * три токена `s`/`23`/`u`. Обычные буквенные синонимы (`нот`, `промакс`, кириллические названия
 * брендов) этой проблеме не подвержены — в них нет цифр, `splitLettersAndDigits` их не трогает,
 * и они по-прежнему раскрываются основным проходом (см. normalize-query.ts); применять этот
 * ранний проход ко всем токенам без разбора было бы избыточно и добавило бы неочевидную связь
 * с порядком проверки раскладки клавиатуры (`correctKeyboardLayout` полагается на то, что видит
 * ещё не раскрытые кириллические слова).
 */
export function expandCompoundSynonyms(
  tokens: readonly string[],
  dictionary: NormalizationDictionary,
): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    if (!isMixedAlphanumeric(token)) {
      result.push(token);
      continue;
    }
    const expansion = dictionary.synonyms[token.toLowerCase()];
    if (expansion === undefined) {
      result.push(token);
    } else {
      result.push(...expansion);
    }
  }
  return result;
}

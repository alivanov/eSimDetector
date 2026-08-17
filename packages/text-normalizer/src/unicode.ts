/**
 * Приведение регистра, Unicode-нормализация и унификация визуально схожих символов
 * (docs/04-matching-algorithm.md, §4.4, первая и пятая строки таблицы).
 */

/** Приводит строку к нижнему регистру. Отдельная функция — для явного места в конвейере. */
export function foldCase(input: string): string {
  return input.toLowerCase();
}

/**
 * Совместимая декомпозиция Unicode (NFKD): полноширинные символы (`ＩＰＨＯＮＥ`) и
 * идеографический пробел приводятся к обычным ASCII-эквивалентам.
 */
export function normalizeUnicode(input: string): string {
  return input.normalize('NFKD');
}

/**
 * Однонаправленные отображения "цифра похожа на букву" и "буква похожа на цифру".
 *
 * Направления сознательно не симметричны и не покрывают все визуально похожие пары:
 * `0 → o` полезно внутри буквенных слов (`iph0ne` → `iphone`), а `o → 0` не включено
 * вовсе, потому что это ровно то преобразование, которое превратило бы `iphone 1o`
 * в придуманное поколение `iphone 10`. Аналогично только `l → 1` (не `1 → l`).
 */
const DIGIT_TO_LETTER_LOOKALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
};

const LETTER_TO_DIGIT_LOOKALIKES: Readonly<Record<string, string>> = {
  l: '1',
};

function isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isAsciiLatinLetter(char: string): boolean {
  return char >= 'a' && char <= 'z';
}

/**
 * Заменяет символы `word` через `lookalikeMap`, но только если после замены слово
 * состоит исключительно из символов, для которых `isTargetChar` истинно (плюс хотя бы
 * одна реальная замена). Это и есть "подтверждённый контекст" из ограничения задачи:
 * если в слове есть посторонний символ, который не является ни ключом словаря, ни уже
 * целевым типом символа, замена не выполняется — слово оставляется как есть.
 */
function convertIfWordIsPure(
  word: string,
  lookalikeMap: Readonly<Record<string, string>>,
  isTargetChar: (char: string) => boolean,
): string | undefined {
  let hasLookalike = false;
  for (const char of word) {
    if (char in lookalikeMap) {
      hasLookalike = true;
      continue;
    }
    if (!isTargetChar(char)) {
      return undefined;
    }
  }

  if (!hasLookalike) {
    return undefined;
  }

  let result = '';
  for (const char of word) {
    result += lookalikeMap[char] ?? char;
  }
  return result;
}

function unifyWordLookalikes(word: string): string {
  const asDigits = convertIfWordIsPure(word, LETTER_TO_DIGIT_LOOKALIKES, isAsciiDigit);
  if (asDigits !== undefined) {
    return asDigits;
  }

  const asLetters = convertIfWordIsPure(word, DIGIT_TO_LETTER_LOOKALIKES, isAsciiLatinLetter);
  if (asLetters !== undefined) {
    return asLetters;
  }

  return word;
}

/**
 * Унифицирует визуально схожие символы внутри слов, состоящих из латиницы и цифр.
 * Ожидает уже приведённый к нижнему регистру вход (см. {@link foldCase}).
 *
 * Никогда не меняет уже корректную цифру: `s23` остаётся `s23`, `iphone 13` — `iphone 13`,
 * потому что цифры поколения затем сравниваются точно (docs/04 §4.2), и порча цифры на
 * этом шаге стоит дороже, чем отсутствие исправления (К1, вес 0,40).
 */
export function unifyLookalikes(input: string): string {
  return input.replace(/[a-z0-9]+/g, unifyWordLookalikes);
}

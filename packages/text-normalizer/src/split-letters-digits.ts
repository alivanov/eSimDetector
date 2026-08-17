/**
 * Разделение слипшихся букв и цифр (docs/04-matching-algorithm.md, §4.4, четвёртая
 * строка таблицы): `iphone13promax` → `iphone 13 promax`.
 *
 * Разделяет только по границе "буква ↔ цифра". Дальнейшее разбиение `promax` на
 * `pro` и `max` — задача словаря синонимов (устоявшееся сокращение), а не этого шага:
 * здесь нет словаря, и распознавать составные буквенные слова нечем и не нужно.
 */

const LETTER_THEN_DIGIT = /(\p{L})(\p{Nd})/gu;
const DIGIT_THEN_LETTER = /(\p{Nd})(\p{L})/gu;

export function splitLettersAndDigits(input: string): string {
  return input.replace(LETTER_THEN_DIGIT, '$1 $2').replace(DIGIT_THEN_LETTER, '$1 $2');
}

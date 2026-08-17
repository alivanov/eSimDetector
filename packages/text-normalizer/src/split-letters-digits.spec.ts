import { splitLettersAndDigits } from './split-letters-digits';

describe('splitLettersAndDigits', () => {
  it('docs/04 §4.4: разделение слипшихся букв и цифр', () => {
    // Разделяет только границу "буква ↔ цифра": "promax" сюда не входит и остаётся
    // единым буквенным словом — его раскрытие в "pro max" выполняет словарь синонимов
    // (см. synonyms.spec.ts), а не этот шаг.
    expect(splitLettersAndDigits('iphone13promax')).toBe('iphone 13 promax');
  });

  it('разделяет по границе цифра → буква', () => {
    expect(splitLettersAndDigits('13pro')).toBe('13 pro');
  });

  it('разделяет несколько границ подряд', () => {
    expect(splitLettersAndDigits('note12pro')).toBe('note 12 pro');
  });

  it('работает с кириллицей', () => {
    expect(splitLettersAndDigits('самсунг23')).toBe('самсунг 23');
  });

  it('не трогает уже разделённую строку', () => {
    expect(splitLettersAndDigits('iphone 13')).toBe('iphone 13');
  });

  it('не трогает чисто буквенное слово', () => {
    expect(splitLettersAndDigits('galaxy')).toBe('galaxy');
  });

  it('не трогает чисто цифровое слово', () => {
    expect(splitLettersAndDigits('2023')).toBe('2023');
  });

  it('сохраняет значение цифры при разделении — "s23" становится "s 23", а не другим числом', () => {
    expect(splitLettersAndDigits('s23')).toBe('s 23');
  });
});

import { foldCase, normalizeUnicode, unifyLookalikes } from './unicode';

describe('foldCase + normalizeUnicode', () => {
  it('docs/04 §4.4: приведение регистра и Unicode-нормализация (NFKD)', () => {
    // Полноширинные символы (ＩＰＨＯＮＥ) и идеографический пробел — компонентные
    // эквиваленты обычных ASCII-символов, различаются только формой начертания.
    const input = 'ＩＰＨＯＮＥ\u3000１３';
    expect(foldCase(normalizeUnicode(input))).toBe('iphone 13');
  });

  it('normalizeUnicode не трогает обычный ASCII-текст', () => {
    expect(normalizeUnicode('iphone 13')).toBe('iphone 13');
  });

  it('foldCase приводит кириллицу и латиницу к нижнему регистру', () => {
    expect(foldCase('САМСУНГ Galaxy')).toBe('самсунг galaxy');
  });
});

describe('unifyLookalikes', () => {
  it('docs/04 §4.4: унификация визуально схожих символов', () => {
    expect(unifyLookalikes('iph0ne l3')).toBe('iphone 13');
  });

  it('заменяет "0" на "o" внутри буквенного слова', () => {
    expect(unifyLookalikes('c0mpany')).toBe('company');
  });

  it('заменяет "l" на "1" внутри цифрового слова', () => {
    expect(unifyLookalikes('l3')).toBe('13');
  });

  it('не меняет уже корректную цифру генерации: "s23" остаётся "s23"', () => {
    expect(unifyLookalikes('s23')).toBe('s23');
  });

  it('не меняет уже корректный запрос: "iphone 13" остаётся "iphone 13"', () => {
    expect(unifyLookalikes('iphone 13')).toBe('iphone 13');
  });

  it('не придумывает несуществующее поколение: "iphone 1o" не становится "iphone 10"', () => {
    // Критическое ограничение задачи: "o → 0" отсутствует в таблице лукэлайков
    // намеренно, иначе "iphone 1o" превратилось бы в устройство, которого не было.
    expect(unifyLookalikes('iphone 1o')).toBe('iphone 1o');
  });

  it('не трогает слово, состоящее только из цифр', () => {
    expect(unifyLookalikes('2023')).toBe('2023');
  });

  it('не трогает слово, состоящее только из букв без лукэлайков', () => {
    expect(unifyLookalikes('galaxy')).toBe('galaxy');
  });

  it('не заменяет, если в слове есть посторонний символ (не цифра и не буква-цель)', () => {
    // "l3x": попытка перевести в цифры невозможна, потому что "x" — не цифра.
    expect(unifyLookalikes('l3x')).toBe('l3x');
  });

  it('пропускает через себя пробелы и разделители', () => {
    expect(unifyLookalikes('l3 pro')).toBe('13 pro');
  });
});

import { foldCase } from './unicode';
import { unifySeparators, collapseWhitespace, stripPunctuation } from './separators';

describe('unifySeparators', () => {
  it('docs/04 §4.4: унификация разделителей (дефисы, подчёркивания, точки, кавычки)', () => {
    // '\u2011' — неразрывный дефис, именно такой символ приведён в примере документации.
    expect(unifySeparators('iphone\u201113_pro')).toBe('iphone 13 pro');
  });

  it('унифицирует разные виды дефисов и тире', () => {
    expect(unifySeparators('a-b\u2010c\u2012d\u2013e\u2014f')).toBe('a b c d e f');
  });

  it('унифицирует точки, кавычки, апострофы и слэши', () => {
    expect(unifySeparators(`a.b'c"d\`e/f\\g`)).toBe('a b c d e f g');
  });

  it('не трогает строку без разделителей', () => {
    expect(unifySeparators('iphone 13 pro')).toBe('iphone 13 pro');
  });
});

describe('collapseWhitespace', () => {
  it('свёртывает несколько пробелов в один и обрезает края', () => {
    expect(collapseWhitespace('   a    b   ')).toBe('a b');
  });

  it('пустая строка после обрезки остаётся пустой', () => {
    expect(collapseWhitespace('   ')).toBe('');
  });
});

describe('stripPunctuation', () => {
  it('удаляет служебные символы, оставляя буквы, цифры и пробелы', () => {
    expect(stripPunctuation('iPhone 13 !!')).toBe('iPhone 13 ');
  });

  it('работает с кириллицей', () => {
    expect(stripPunctuation('привет?!')).toBe('привет');
  });

  it('не трогает буквы, цифры и пробелы', () => {
    expect(stripPunctuation('iphone 13')).toBe('iphone 13');
  });
});

describe('composition (docs/04 §4.4, третья строка таблицы)', () => {
  it('свёртка пробелов и удаление служебных символов', () => {
    const input = '  iPhone   13  !!';
    const result = collapseWhitespace(stripPunctuation(foldCase(input)));
    expect(result).toBe('iphone 13');
  });
});

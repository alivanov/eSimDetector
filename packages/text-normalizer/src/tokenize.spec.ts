import { tokenize } from './tokenize';

describe('tokenize', () => {
  it('разбивает нормализованную строку по пробелам', () => {
    expect(tokenize('iphone 13 pro')).toEqual(['iphone', '13', 'pro']);
  });

  it('схлопывает несколько пробелов подряд', () => {
    expect(tokenize('iphone   13')).toEqual(['iphone', '13']);
  });

  it('обрезает пробелы по краям', () => {
    expect(tokenize('  iphone 13  ')).toEqual(['iphone', '13']);
  });

  it('пустая строка даёт пустой список токенов', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('строка из одних пробелов даёт пустой список токенов', () => {
    expect(tokenize('   ')).toEqual([]);
  });

  it('одно слово даёт список из одного токена', () => {
    expect(tokenize('iphone')).toEqual(['iphone']);
  });
});

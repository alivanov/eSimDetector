import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('"*" отражает любой источник', () => {
    expect(parseCorsOrigins('*')).toBe(true);
  });

  it('пустая строка запрещает все источники явно', () => {
    expect(parseCorsOrigins('')).toEqual([]);
  });

  it('строка из пробелов трактуется как пустая (запрет всех источников)', () => {
    expect(parseCorsOrigins('   ')).toEqual([]);
  });

  it('одиночный источник возвращается списком из одного элемента', () => {
    expect(parseCorsOrigins('https://esim-detector.example.ru')).toEqual([
      'https://esim-detector.example.ru',
    ]);
  });

  it('список через запятую разбирается с обрезкой пробелов', () => {
    expect(
      parseCorsOrigins(' https://a.example.ru , https://b.example.ru,https://c.example.ru '),
    ).toEqual(['https://a.example.ru', 'https://b.example.ru', 'https://c.example.ru']);
  });

  it('пустые элементы списка (двойные запятые) отфильтровываются', () => {
    expect(parseCorsOrigins('https://a.example.ru,,https://b.example.ru')).toEqual([
      'https://a.example.ru',
      'https://b.example.ru',
    ]);
  });
});

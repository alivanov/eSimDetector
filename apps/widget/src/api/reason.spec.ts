import { parseReasons } from './reason';

describe('parseReasons', () => {
  it('undefined -> пустой массив (поле в ответе отсутствует)', () => {
    expect(parseReasons(undefined)).toEqual([]);
  });

  it('разбирает массив с необязательным detail', () => {
    expect(parseReasons([{ code: 'PLATFORM_DETECTED' }, { code: 'X', detail: 'y' }])).toEqual([
      { code: 'PLATFORM_DETECTED' },
      { code: 'X', detail: 'y' },
    ]);
  });

  it('открытое множество: незнакомый код всё равно проходит', () => {
    expect(parseReasons([{ code: 'SOME_FUTURE_CODE_ADDED_BY_SERVER' }])).toEqual([
      { code: 'SOME_FUTURE_CODE_ADDED_BY_SERVER' },
    ]);
  });

  it('undefined при неразобранной форме', () => {
    expect(parseReasons([{ code: 1 }])).toBeUndefined();
    expect(parseReasons([{ detail: 'x' }])).toBeUndefined();
    expect(parseReasons('not-an-array')).toBeUndefined();
    expect(parseReasons([{ code: 'X', detail: 1 }])).toBeUndefined();
  });
});

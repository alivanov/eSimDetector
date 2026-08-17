import { detectModelCode } from './model-code';

describe('detectModelCode', () => {
  it('docs/04 §4.5: распознаёт сервисный код Samsung "SM-S928B"', () => {
    expect(detectModelCode('SM-S928B')).toBe('SM-S928B');
  });

  it('распознаёт код Samsung в нижнем регистре и с пробелами по краям', () => {
    expect(detectModelCode('  sm-s918b  ')).toBe('SM-S918B');
  });

  it('распознаёт код Samsung без буквенного хвоста', () => {
    expect(detectModelCode('SM-A346')).toBe('SM-A346');
  });

  it('docs/04 §4.5: распознаёт сервисный код Oppo/Realme/OnePlus "CPH2451"', () => {
    expect(detectModelCode('CPH2451')).toBe('CPH2451');
  });

  it('docs/04 §4.5: распознаёт сервисный код Xiaomi вида "23090RA98G"', () => {
    expect(detectModelCode('23090RA98G')).toBe('23090RA98G');
  });

  it('распознаёт код Xiaomi вида "2201116SG"', () => {
    expect(detectModelCode('2201116SG')).toBe('2201116SG');
  });

  it('не распознаёт обычное название модели', () => {
    expect(detectModelCode('iPhone 15 Pro')).toBeUndefined();
  });

  it('не распознаёт голое поколение как код', () => {
    expect(detectModelCode('13')).toBeUndefined();
  });

  it('не распознаёт объём памяти как код Xiaomi (недостаточно цифр в начале)', () => {
    expect(detectModelCode('256GB')).toBeUndefined();
  });

  it('не распознаёт год выпуска как код', () => {
    expect(detectModelCode('2024')).toBeUndefined();
  });

  it('не распознаёт код, встретившийся внутри более длинной фразы', () => {
    expect(detectModelCode('самсунг SM-S928B')).toBeUndefined();
  });

  it('не распознаёт пустую строку', () => {
    expect(detectModelCode('')).toBeUndefined();
  });

  it('не распознаёт строку из одних пробелов', () => {
    expect(detectModelCode('   ')).toBeUndefined();
  });

  it('не распознаёт код Samsung с некорректным числом цифр', () => {
    expect(detectModelCode('SM-S9')).toBeUndefined();
  });

  it('не распознаёт код Oppo/Realme/OnePlus с неверным числом цифр', () => {
    expect(detectModelCode('CPH24')).toBeUndefined();
  });
});

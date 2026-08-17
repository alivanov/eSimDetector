import type { NormalizationDictionary } from './types';
import { parseSlots } from './slots';

const TRANSLITERATION: NormalizationDictionary['transliteration'] = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function buildDictionary(): NormalizationDictionary {
  return {
    synonyms: {},
    transliteration: TRANSLITERATION,
    keyboardLayout: {},
    insignificantAttributes: {
      storagePatterns: ['128gb', '256gb', '512gb'],
      colors: ['black', 'черный'],
      networkMarkers: ['5g', '4g', 'lte'],
      dualSimMarkers: ['dual sim', 'dualsim'],
    },
    stopWords: ['телефон', 'хочу', 'купить'],
  };
}

describe('parseSlots — docs/04 §4.5', () => {
  it('разбирает "samsung galaxy s 23 ultra" на бренд/семейство(кебаб)/поколение/модификатор', () => {
    const slots = parseSlots(['samsung', 'galaxy', 's', '23', 'ultra'], buildDictionary());

    expect(slots).toEqual({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['ultra'],
      attributes: {},
      unparsed: [],
    });
  });

  it('семейство собирается в кебаб-кейсе, а не через пробел (docs/05 §5.3)', () => {
    const slots = parseSlots(['xiaomi', 'redmi', 'note', '12'], buildDictionary());

    expect(slots.family).toBe('redmi-note');
    expect(slots.family).not.toContain(' ');
  });

  it('единственный словесный токен используется и как brand, и как family ("iphone 15 pro")', () => {
    const slots = parseSlots(['iphone', '15', 'pro'], buildDictionary());

    expect(slots.brand).toBe('iphone');
    expect(slots.family).toBe('iphone');
    expect(slots.generation).toBe(15);
    expect(slots.modifiers).toEqual(['pro']);
  });

  it('docs/04 §4.5: "iPhone 15 Pro 256Gb черный" — generation 15, а не искажён атрибутами', () => {
    const slots = parseSlots(['iphone', '15', 'pro', '256', 'gb', 'черный'], buildDictionary());

    expect(slots.generation).toBe(15);
    expect(slots.attributes.storage).toBe('256gb');
    expect(slots.attributes.color).toBe('черный');
    expect(slots.unparsed).toEqual([]);
  });

  it('docs/04 §4.5: "Galaxy S24 Ultra 5G Dual SIM" — generation 24, а не 5', () => {
    const slots = parseSlots(
      ['galaxy', 's', '24', 'ultra', '5', 'g', 'dual', 'sim'],
      buildDictionary(),
    );

    expect(slots.generation).toBe(24);
    expect(slots.attributes.network).toBe('5g');
    expect(slots.attributes.dualSim).toBe(true);
    expect(slots.modifiers).toEqual(['ultra']);
  });
});

describe('parseSlots — предметное правило: "pro" и "pro max" различимы', () => {
  it('модификатор "pro" даёт набор, отличный от "pro max"', () => {
    const proOnly = parseSlots(['iphone', '13', 'pro'], buildDictionary());
    const proMax = parseSlots(['iphone', '13', 'pro', 'max'], buildDictionary());

    expect(proOnly.modifiers).toEqual(['pro']);
    expect(proMax.modifiers).toEqual(['pro', 'max']);
    expect(proOnly.modifiers).not.toEqual(proMax.modifiers);
  });
});

describe('parseSlots — стоп-слова', () => {
  it('стоп-слово не попадает ни в бренд/семейство, ни в unparsed', () => {
    const slots = parseSlots(['хочу', 'samsung', 'galaxy', 's', '23'], buildDictionary());

    expect(slots.brand).toBe('samsung');
    expect(slots.family).toBe('galaxy-s');
    expect(slots.unparsed).toEqual([]);
  });

  it('распознаёт стоп-слово уже после транслитерации ("khochu")', () => {
    const slots = parseSlots(['khochu', 'iphone', '13'], buildDictionary());

    expect(slots.brand).toBe('iphone');
    expect(slots.unparsed).toEqual([]);
  });
});

describe('parseSlots — испорченный модификатор (isSingleEditAway/looksLikeCorruptedModifier, дефект 1)', () => {
  it('транспозиция двух соседних символов ("por" от "pro") уводит токен в unparsed, а не в family', () => {
    const slots = parseSlots(['huawei', 'p', '60', 'por'], buildDictionary());

    expect(slots.brand).toBe('huawei');
    expect(slots.family).toBe('p');
    expect(slots.unparsed).toEqual(['por']);
  });

  it('замена одного символа ("aip" от "air") тоже распознаётся как испорченный модификатор', () => {
    const slots = parseSlots(['iphone', '15', 'aip'], buildDictionary());

    expect(slots.family).toBe('iphone');
    expect(slots.unparsed).toEqual(['aip']);
  });

  it('удаление символа ("ultr" от "ultra") распознаётся как испорченный модификатор', () => {
    const slots = parseSlots(['xiaomi', '13', 'ultr'], buildDictionary());

    expect(slots.family).toBe('xiaomi');
    expect(slots.unparsed).toEqual(['ultr']);
  });

  it('вставка символа ("litex" от "lite") распознаётся как испорченный модификатор', () => {
    const slots = parseSlots(['brand', '5', 'litex'], buildDictionary());

    expect(slots.family).toBe('brand');
    expect(slots.unparsed).toEqual(['litex']);
  });

  it('токен на расстоянии двух и более правок от любого модификатора остаётся частью family', () => {
    const slots = parseSlots(['brand', '5', 'folxx'], buildDictionary());

    expect(slots.family).toBe('folxx');
    expect(slots.unparsed).toEqual([]);
  });

  it('короткий токен (< 3 символов) не проверяется, даже если он рядом с "pro" по расстоянию', () => {
    const slots = parseSlots(['iphone', 'po'], buildDictionary());

    expect(slots.family).toBe('po');
    expect(slots.unparsed).toEqual([]);
  });

  it('первый словесный токен (позиция 0) никогда не проверяется на испорченный модификатор', () => {
    const slots = parseSlots(['pxo', '15', 'ultra'], buildDictionary());

    expect(slots.brand).toBe('pxo');
    expect(slots.family).toBe('pxo');
    expect(slots.modifiers).toEqual(['ultra']);
    expect(slots.unparsed).toEqual([]);
  });
});

describe('parseSlots — unparsed', () => {
  it('нераспознанный числовой токен без единицы измерения уходит в unparsed, а не в атрибуты', () => {
    const slots = parseSlots(['iphone', '13', '999'], buildDictionary());

    expect(slots.generation).toBe(13);
    expect(slots.unparsed).toEqual(['999']);
  });

  it('на пустом списке токенов возвращает пустую структуру без бренда, семейства и поколения', () => {
    const slots = parseSlots([], buildDictionary());

    expect(slots).toEqual({
      modifiers: [],
      attributes: {},
      unparsed: [],
    });
    expect(slots.brand).toBeUndefined();
    expect(slots.family).toBeUndefined();
    expect(slots.generation).toBeUndefined();
  });
});

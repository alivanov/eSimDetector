import type { NormalizationDictionary } from './types';
import { extractAttributes } from './attributes';

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

function buildDictionary(
  overrides: Partial<NormalizationDictionary['insignificantAttributes']> = {},
): NormalizationDictionary {
  return {
    synonyms: {},
    transliteration: TRANSLITERATION,
    keyboardLayout: {},
    insignificantAttributes: {
      storagePatterns: ['128gb', '256gb', '512gb', '256гб'],
      colors: ['black', 'white', 'черный', 'белый'],
      networkMarkers: ['5g', '4g', 'lte', '3g'],
      dualSimMarkers: [
        'dual sim',
        'dualsim',
        'dual-sim',
        '2 sim',
        'две сим',
        'двойная сим',
        'dsim',
      ],
      ...overrides,
    },
    stopWords: [],
  };
}

describe('extractAttributes — объём памяти', () => {
  it('docs/04 §4.5: собирает "256" + "gb" (после splitLettersAndDigits) в attributes.storage', () => {
    const result = extractAttributes(['iphone', '15', 'pro', '256', 'gb'], buildDictionary());

    expect(result.attributes.storage).toBe('256gb');
    expect(result.remainingTokens).toEqual(['iphone', '15', 'pro']);
  });

  it('распознаёт объём в кириллических единицах ("256" + "гб")', () => {
    const result = extractAttributes(['256', 'гб'], buildDictionary());

    expect(result.attributes.storage).toBe('256гб');
  });

  it('не путает произвольное число с объёмом без единицы измерения', () => {
    const result = extractAttributes(['128'], buildDictionary());

    expect(result.attributes.storage).toBeUndefined();
    expect(result.remainingTokens).toEqual(['128']);
  });
});

describe('extractAttributes — сеть (5G и т.д.)', () => {
  it('docs/04 §4.5: "Galaxy S24 Ultra 5G" — "5" + "g" даёт attributes.network "5g", а не generation 5', () => {
    const result = extractAttributes(['galaxy', 's', '24', 'ultra', '5', 'g'], buildDictionary());

    expect(result.attributes.network).toBe('5g');
    expect(result.remainingTokens).toEqual(['galaxy', 's', '24', 'ultra']);
  });

  it('распознаёт сетевой маркер, не требующий разделения ("lte")', () => {
    const result = extractAttributes(['iphone', '13', 'lte'], buildDictionary());

    expect(result.attributes.network).toBe('lte');
  });
});

describe('extractAttributes — Dual SIM', () => {
  it('docs/04 §4.5: "dual" + "sim" даёт attributes.dualSim = true, а не текстовое значение', () => {
    const result = extractAttributes(['galaxy', 's', '24', 'dual', 'sim'], buildDictionary());

    expect(result.attributes.dualSim).toBe(true);
    expect(result.remainingTokens).toEqual(['galaxy', 's', '24']);
  });

  it('распознаёт слитную запись "dualsim"', () => {
    expect(extractAttributes(['dualsim'], buildDictionary()).attributes.dualSim).toBe(true);
  });

  it('распознаёт сокращение "dsim"', () => {
    expect(extractAttributes(['dsim'], buildDictionary()).attributes.dualSim).toBe(true);
  });

  it('распознаёт числовую форму "2 sim"', () => {
    expect(extractAttributes(['2', 'sim'], buildDictionary()).attributes.dualSim).toBe(true);
  });

  it('распознаёт кириллическую форму "две сим" до транслитерации', () => {
    expect(extractAttributes(['две', 'сим'], buildDictionary()).attributes.dualSim).toBe(true);
  });

  it('распознаёт кириллическую форму "двойная сим" уже после транслитерации ("dvojnaya"+"sim")', () => {
    // Конвейер normalizeQuery транслитерирует токены раньше, чем вызывает parseSlots
    // (см. normalize-query.spec.ts) — эта функция обязана узнавать образец в обеих формах.
    expect(extractAttributes(['dvojnaya', 'sim'], buildDictionary()).attributes.dualSim).toBe(true);
  });
});

describe('extractAttributes — цвет', () => {
  it('распознаёт цвет на латинице', () => {
    expect(extractAttributes(['iphone', '15', 'black'], buildDictionary()).attributes.color).toBe(
      'black',
    );
  });

  it('docs/04 §4.5: "iPhone 15 Pro 256Gb черный" — распознаёт кириллический цвет до транслитерации', () => {
    const result = extractAttributes(
      ['iphone', '15', 'pro', '256', 'gb', 'черный'],
      buildDictionary(),
    );

    expect(result.attributes.color).toBe('черный');
    expect(result.attributes.storage).toBe('256gb');
    expect(result.remainingTokens).toEqual(['iphone', '15', 'pro']);
  });

  it('распознаёт кириллический цвет уже после транслитерации ("chernyj")', () => {
    expect(extractAttributes(['chernyj'], buildDictionary()).attributes.color).toBe('chernyj');
  });
});

describe('extractAttributes — год', () => {
  it('распознаёт четырёхзначный год XXI века', () => {
    const result = extractAttributes(['iphone', '13', '2021'], buildDictionary());

    expect(result.attributes.year).toBe(2021);
    expect(result.remainingTokens).toEqual(['iphone', '13']);
  });

  it('не принимает поколение (короткое число) за год', () => {
    expect(extractAttributes(['13'], buildDictionary()).attributes.year).toBeUndefined();
  });

  it('не принимает число не из диапазона XXI века за год', () => {
    expect(extractAttributes(['1999'], buildDictionary()).attributes.year).toBeUndefined();
  });
});

describe('extractAttributes — общее поведение', () => {
  it('на пустом списке токенов возвращает пустые атрибуты и пустой остаток', () => {
    const result = extractAttributes([], buildDictionary());

    expect(result.attributes).toEqual({});
    expect(result.remainingTokens).toEqual([]);
  });

  it('токен, не входящий ни в один словарь атрибутов, остаётся в remainingTokens без изменений', () => {
    const result = extractAttributes(['galaxy', 's', '24', 'ultra'], buildDictionary());

    expect(result.attributes).toEqual({});
    expect(result.remainingTokens).toEqual(['galaxy', 's', '24', 'ultra']);
  });

  it('собирает сразу несколько атрибутов из одного запроса', () => {
    const result = extractAttributes(
      ['galaxy', 's', '24', 'ultra', '5', 'g', 'dual', 'sim', '256', 'gb', 'black'],
      buildDictionary(),
    );

    expect(result.attributes).toEqual({
      network: '5g',
      dualSim: true,
      storage: '256gb',
      color: 'black',
    });
    expect(result.remainingTokens).toEqual(['galaxy', 's', '24', 'ultra']);
  });

  it('окно из двух токенов проверяется раньше окна из одного (жадное совпадение)', () => {
    // "black" сам по себе — цвет, но здесь он не должен помешать смежному разбору:
    // проверяем, что двухтокенное окно "256"+"gb" предпочитается перед однотокенным.
    const result = extractAttributes(['256', 'gb'], buildDictionary());

    expect(result.attributes.storage).toBe('256gb');
    expect(result.remainingTokens).toEqual([]);
  });
});

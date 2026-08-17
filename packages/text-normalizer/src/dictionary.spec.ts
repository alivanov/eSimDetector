import { parseNormalizationDictionary } from './dictionary';

function buildValidRawDictionary(): unknown {
  return {
    synonyms: {
      айфон: ['iphone'],
      s23u: ['galaxy', 's23', 'ultra'],
    },
    transliteration: {
      а: 'a',
      ъ: '',
    },
    keyboardLayout: {
      й: 'q',
    },
    insignificantAttributes: {
      storagePatterns: ['128gb'],
      colors: ['black'],
      networkMarkers: ['5g'],
      dualSimMarkers: ['dual sim'],
    },
    stopWords: ['телефон'],
  };
}

describe('parseNormalizationDictionary — успешный разбор', () => {
  it('разбирает корректный словарь целиком', () => {
    const result = parseNormalizationDictionary(buildValidRawDictionary());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('ожидался успешный разбор');
    }
    expect(result.value).toEqual({
      synonyms: { айфон: ['iphone'], s23u: ['galaxy', 's23', 'ultra'] },
      transliteration: { а: 'a', ъ: '' },
      keyboardLayout: { й: 'q' },
      insignificantAttributes: {
        storagePatterns: ['128gb'],
        colors: ['black'],
        networkMarkers: ['5g'],
        dualSimMarkers: ['dual sim'],
      },
      stopWords: ['телефон'],
    });
  });

  it('допускает пустые словари и списки, если формат соблюдён', () => {
    const raw = {
      synonyms: {},
      transliteration: {},
      keyboardLayout: {},
      insignificantAttributes: {
        storagePatterns: [],
        colors: [],
        networkMarkers: [],
        dualSimMarkers: [],
      },
      stopWords: [],
    };

    expect(parseNormalizationDictionary(raw).ok).toBe(true);
  });
});

describe('parseNormalizationDictionary — недоверенные внешние данные (ADR-016)', () => {
  it('отказывает, если корень не является объектом', () => {
    const result = parseNormalizationDictionary('не объект');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('ожидался отказ в разборе');
    }
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('отказывает, если корень — массив', () => {
    expect(parseNormalizationDictionary([]).ok).toBe(false);
  });

  it('отказывает, если корень — null', () => {
    expect(parseNormalizationDictionary(null).ok).toBe(false);
  });

  it('отказывает, если "synonyms" отсутствует', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    delete raw['synonyms'];

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если "synonyms" — не объект', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['synonyms'] = ['не', 'то'];

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если значение синонима — не список строк', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['synonyms'] = { нот: 'note' };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если список раскрытия синонима пустой', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['synonyms'] = { нот: [] };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если токен раскрытия синонима — пустая строка', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['synonyms'] = { нот: [''] };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если ключ словаря — пустая строка', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['synonyms'] = { '': ['note'] };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если "transliteration" содержит нестроковое значение', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['transliteration'] = { а: 1 };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если "transliteration" — не объект', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['transliteration'] = 'а→a';

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если ключ карты символов — пустая строка', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['keyboardLayout'] = { '': 'q' };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если "insignificantAttributes" — не объект', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['insignificantAttributes'] = null;

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если в "insignificantAttributes" не хватает поля', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['insignificantAttributes'] = { storagePatterns: ['128gb'] };

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('отказывает, если "stopWords" — не список строк', () => {
    const raw = buildValidRawDictionary();
    if (!isPlainObject(raw)) {
      throw new Error('фикстура должна быть объектом');
    }
    raw['stopWords'] = [1, 2, 3];

    expect(parseNormalizationDictionary(raw).ok).toBe(false);
  });

  it('накапливает ошибки сразу по нескольким полям', () => {
    const result = parseNormalizationDictionary({
      synonyms: 'не то',
      transliteration: 'не то',
      keyboardLayout: 'не то',
      insignificantAttributes: 'не то',
      stopWords: 'не то',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('ожидался отказ в разборе');
    }
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

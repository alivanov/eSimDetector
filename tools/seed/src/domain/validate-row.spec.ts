import { loadRealDictionary } from '../testing/dictionary-fixture';
import { parseCodePatterns } from './code-patterns';
import type { ValidateRowContext } from './validate-row';
import { validateRow } from './validate-row';

const dictionary = loadRealDictionary();
const { patterns: codePatterns } = parseCodePatterns({
  samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$',
});

function context(overrides: Partial<ValidateRowContext> = {}): ValidateRowContext {
  return {
    source: 'llm:test-model',
    batchId: '02-samsung-galaxy-s',
    lineNumber: 2,
    now: new Date('2026-08-18T00:00:00Z'),
    dictionary,
    codePatterns,
    osVersionCeilings: { android: 16, ios: 18 },
    ...overrides,
  };
}

describe('validateRow', () => {
  it('строит кандидата из корректной строки', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24 Ultra',
        modelCodes: 'SM-S928B',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
        dualSim: 'physical+esim',
        ruMarket: 'official',
        confidence: 'high',
      },
      context(),
    );

    expect(result.quarantine).toBeUndefined();
    expect(result.candidate).toEqual(
      expect.objectContaining({
        id: 'samsung-galaxy-s24-ultra',
        brand: 'samsung',
        brandTitle: 'Samsung',
        family: 'galaxy-s',
        generation: 24,
        modifiers: ['ultra'],
        modelCodes: ['SM-S928B'],
        platform: 'android',
        deviceType: 'phone',
        releaseYear: 2024,
        esimSupport: 'yes',
        dualSim: 'physical+esim',
        ruMarket: 'official',
        confidenceSelfReported: 'high',
      }),
    );
  });

  it('карантин ENUM_INVALID при недопустимом platform', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'windows',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин ENUM_INVALID при недопустимом device_type', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'car',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин ENUM_INVALID при недопустимом esim_support', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'maybe',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин ENUM_INVALID при недопустимом dual_sim', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
        dualSim: 'triple-sim',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин ENUM_INVALID при недопустимом ru_market', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
        ruMarket: 'moon',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин ENUM_INVALID при недопустимом confidence', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
        confidence: 'absolute',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ENUM_INVALID');
  });

  it('карантин NAME_UNPARSEABLE при пустом marketing_name', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: '',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('NAME_UNPARSEABLE');
  });

  it('карантин BRAND_UNKNOWN для неизвестного бренда', () => {
    const result = validateRow(
      {
        brand: 'НеизвестныйБренд',
        marketingName: 'Модель Х',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('BRAND_UNKNOWN');
  });

  it('карантин NAME_UNPARSEABLE, когда название не содержит ни одного словесного токена', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: '★ ??? ★',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('NAME_UNPARSEABLE');
  });

  it('карантин YEAR_IMPLAUSIBLE для года выпуска вне диапазона', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '1999',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('YEAR_IMPLAUSIBLE');
  });

  it('карантин ESIM_ANACHRONISM для eSIM у устройства до 2017 года', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S6',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2015',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('ESIM_ANACHRONISM');
  });

  it('не карантинит "no" у устройства до 2017 года (анахронизм — только про заявленную eSIM)', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S6',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2015',
        esimSupport: 'no',
      },
      context(),
    );
    expect(result.quarantine).toBeUndefined();
  });

  it('отбрасывает код, не соответствующий шаблону вендора (CODE_PATTERN_INVALID), сохраняя строку', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        modelCodes: 'SM-G960?',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
      },
      context(),
    );
    expect(result.quarantine).toBeUndefined();
    expect(result.candidate?.modelCodes).toEqual([]);
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'CODE_PATTERN_INVALID' }),
    ]);
  });

  it('не проверяет код бренда без шаблона в code-patterns.json (документированный пробел)', () => {
    const result = validateRow(
      {
        brand: 'Tecno',
        marketingName: 'Spark 10',
        modelCodes: 'ANYTHING-GOES',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'no',
      },
      context(),
    );
    expect(result.candidate?.modelCodes).toEqual(['ANYTHING-GOES']);
    expect(result.notices).toEqual([]);
  });

  it('карантин CONDITION_SYNTAX_INVALID, когда "conditional" без разобравшихся условий', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S10',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2019',
        esimSupport: 'conditional',
        esimConditions: 'firmware:region-dependent',
      },
      context(),
    );
    expect(result.quarantine?.code).toBe('CONDITION_SYNTAX_INVALID');
  });

  it('принимает "conditional" с корректно разобранными условиями', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S10',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2019',
        esimSupport: 'conditional',
        esimConditions: 'region:CN=no',
      },
      context(),
    );
    expect(result.quarantine).toBeUndefined();
    expect(result.candidate?.esimConditions).toEqual([
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN=no' },
    ]);
  });

  it('отбрасывает неправдоподобную os_max_version (OS_VERSION_IMPLAUSIBLE), сохраняя строку', () => {
    const result = validateRow(
      {
        brand: 'Samsung',
        marketingName: 'Galaxy S24',
        platform: 'android',
        deviceType: 'phone',
        releaseYear: '2024',
        esimSupport: 'yes',
        osMaxVersion: '99',
      },
      context(),
    );
    expect(result.quarantine).toBeUndefined();
    expect(result.candidate?.osMaxVersion).toBeUndefined();
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'OS_VERSION_IMPLAUSIBLE' }),
    ]);
  });
});

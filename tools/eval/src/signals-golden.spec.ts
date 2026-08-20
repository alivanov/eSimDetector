import { parseSignalsGolden, SIGNALS_GOLDEN_CATEGORIES } from './signals-golden';

function buildEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'iphone-generations-001',
    category: 'iphone-generations',
    description: 'iPhone 15 Pro, iOS 18.5, Safari',
    source: 'real-device',
    signals: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
      screen: { width: 393, height: 852, dpr: 3 },
      hardware: { maxTouchPoints: 5 },
    },
    expected: {
      platform: 'ios',
      deviceType: 'phone',
      status: 'clarification_required',
      exactModelKnown: false,
      deviceId: null,
    },
    ...overrides,
  };
}

describe('parseSignalsGolden', () => {
  it('разбирает корректную запись', () => {
    const result = parseSignalsGolden([buildEntry()]);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.category).toBe('iphone-generations');
    expect(result.entries[0]?.expected.status).toBe('clarification_required');
  });

  it('отклоняет значение, не являющееся массивом', () => {
    expect(parseSignalsGolden({}).entries).toEqual([]);
    expect(parseSignalsGolden('строка').errors.length).toBeGreaterThan(0);
  });

  it('отклоняет запись с недопустимой категорией', () => {
    const result = parseSignalsGolden([buildEntry({ category: 'смартфоны' })]);
    expect(result.entries).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('отклоняет запись с недопустимым способом сбора (source)', () => {
    const result = parseSignalsGolden([buildEntry({ source: 'догадка' })]);
    expect(result.entries).toEqual([]);
  });

  it('отклоняет запись без обязательных полей signals/expected', () => {
    expect(parseSignalsGolden([buildEntry({ signals: undefined })]).entries).toEqual([]);
    expect(parseSignalsGolden([buildEntry({ expected: undefined })]).entries).toEqual([]);
  });

  it('отклоняет expected с недопустимым platform/deviceType/status', () => {
    expect(
      parseSignalsGolden([
        buildEntry({ expected: { ...(buildEntry()['expected'] as object), platform: 'symbian' } }),
      ]).entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([
        buildEntry({ expected: { ...(buildEntry()['expected'] as object), deviceType: 'car' } }),
      ]).entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([
        buildEntry({ expected: { ...(buildEntry()['expected'] as object), status: 'maybe' } }),
      ]).entries,
    ).toEqual([]);
  });

  it('принимает expected.deviceId непустой строкой, когда exactModelKnown истинно', () => {
    const result = parseSignalsGolden([
      buildEntry({
        expected: {
          platform: 'android',
          deviceType: 'phone',
          status: 'supported',
          exactModelKnown: true,
          deviceId: 'samsung-galaxy-s24-ultra',
        },
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.entries[0]?.expected.deviceId).toBe('samsung-galaxy-s24-ultra');
  });

  it('отклоняет expected.deviceId в виде пустой строки (только непустая строка либо null)', () => {
    const result = parseSignalsGolden([
      buildEntry({
        expected: {
          platform: 'android',
          deviceType: 'phone',
          status: 'supported',
          exactModelKnown: true,
          deviceId: '',
        },
      }),
    ]);
    expect(result.entries).toEqual([]);
  });

  it('принимает опциональные headers/region/notes и отклоняет их при неверной форме', () => {
    const ok = parseSignalsGolden([
      buildEntry({
        headers: { 'Sec-CH-UA-Model': '"SM-S928B"' },
        region: 'CN',
        notes: 'пояснение',
      }),
    ]);
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0]?.headers).toEqual({ 'Sec-CH-UA-Model': '"SM-S928B"' });
    expect(ok.entries[0]?.region).toBe('CN');

    expect(parseSignalsGolden([buildEntry({ headers: 'строка' })]).entries).toEqual([]);
    expect(parseSignalsGolden([buildEntry({ region: '' })]).entries).toEqual([]);
    expect(parseSignalsGolden([buildEntry({ notes: '' })]).entries).toEqual([]);
  });

  it('принимает уточнённую форму uaData/screen/hardware/webgl и отклоняет неверные поля внутри них', () => {
    const ok = parseSignalsGolden([
      buildEntry({
        signals: {
          uaData: {
            platform: 'Android',
            mobile: true,
            model: 'SM-S928B',
            platformVersion: '14.0.0',
            brands: [{ brand: 'Google Chrome', version: '143' }],
          },
          screen: { width: 384, height: 832, dpr: 3.75, orientation: 'portrait-primary' },
          hardware: { maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
          webgl: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' },
        },
      }),
    ]);
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0]?.signals.uaData?.model).toBe('SM-S928B');

    expect(
      parseSignalsGolden([buildEntry({ signals: { uaData: { mobile: 'да' } } })]).entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([buildEntry({ signals: { screen: { width: 'широкий' } } })]).entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([buildEntry({ signals: { hardware: { maxTouchPoints: 'много' } } })])
        .entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([buildEntry({ signals: { webgl: { vendor: 42 } } })]).entries,
    ).toEqual([]);
    expect(
      parseSignalsGolden([buildEntry({ signals: { uaData: { brands: 'не список' } } })]).entries,
    ).toEqual([]);
  });

  it('перечень категорий содержит ровно девять групп, буквально по docs/08 §8.4', () => {
    expect(SIGNALS_GOLDEN_CATEGORIES).toHaveLength(9);
    expect(new Set(SIGNALS_GOLDEN_CATEGORIES).size).toBe(9);
  });
});

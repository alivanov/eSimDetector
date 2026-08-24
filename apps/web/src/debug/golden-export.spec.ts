import { parseSignalsGolden } from '@esim-detector/tools-eval';

import {
  buildExpectedDraft,
  buildGoldenDraft,
  stringifyGoldenDraft,
  suggestGoldenCategory,
  suggestGoldenSource,
} from './golden-export';

/**
 * Проверка «фактически, а не по коду» (критерий готовности этапа 6.4): запись, которую строит
 * стенд отладки, обязана успешно разбираться настоящей `parseSignalsGolden` из
 * `tools/eval/src/signals-golden.ts` без единой ошибки — не имитацией разборщика, а тем же
 * модулем, который прогоняет `data/fixtures/signals.golden.json` (docs/08 §8.4, ADR-037).
 */
describe('стенд отладки → запись signals.golden.json', () => {
  it('запись, построенная из ответа /detect, разбирается parseSignalsGolden без ошибок', () => {
    const detectResponse = {
      requestId: 'r-1',
      status: 'supported' as const,
      confidence: 0.93,
      detection: {
        method: 'ios_version_and_screen_signature',
        platform: 'ios' as const,
        exactModelKnown: false,
        deviceType: 'phone' as const,
      },
      device: undefined,
      candidates: [{ id: 'apple-iphone-15', name: 'iPhone 15' }],
      reasons: [{ code: 'SCREEN_SIGNATURE_MATCHED', detail: '393x852@3' }],
      clarification: undefined,
      presentation: {
        title: 'Ваше устройство поддерживает eSIM',
        description: 'Мы определили, что у вас iPhone одной из моделей, поддерживающих eSIM.',
      },
    };

    const expected = buildExpectedDraft(detectResponse);
    const draft = buildGoldenDraft({
      category: 'iphone-generations',
      source: 'browser-emulation',
      description: 'iPhone 15, эмуляция в DevTools',
      signals: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)' },
      expected,
      notes: 'проверено оператором вручную',
    });

    const { entries, errors } = parseSignalsGolden([draft]);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(draft.id);
    expect(entries[0]?.expected).toEqual(expected);
    expect(draft.notes).toContain('ЧЕРНОВИК');
    expect(draft.notes).toContain('проверено оператором вручную');
  });

  it('запись с region и без notes также успешно разбирается', () => {
    const expected = {
      platform: 'android' as const,
      deviceType: 'phone' as const,
      status: 'not_supported' as const,
      exactModelKnown: true,
      deviceId: 'samsung-galaxy-a05',
    };
    const draft = buildGoldenDraft({
      category: 'android-vendor-ua-ch',
      source: 'real-device',
      description: 'Samsung Galaxy A05',
      signals: { uaData: { platform: 'Android', mobile: true, model: 'SM-A055F' } },
      expected,
      region: 'OTHER',
    });

    const { errors } = parseSignalsGolden([draft]);
    expect(errors).toEqual([]);
    expect(draft.region).toBe('OTHER');
  });

  it('stringifyGoldenDraft печатает читаемый JSON, который разбирается обратно', () => {
    const draft = buildGoldenDraft({
      category: 'tablet',
      source: 'public-ua-database',
      description: 'iPad, сигнатура из открытой базы',
      signals: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' },
      expected: {
        platform: 'ios',
        deviceType: 'tablet',
        status: 'clarification_required',
        exactModelKnown: false,
        deviceId: null,
      },
    });

    const text = stringifyGoldenDraft(draft);
    const roundTripped = JSON.parse(text);
    const { errors } = parseSignalsGolden([roundTripped]);
    expect(errors).toEqual([]);
  });
});

describe('suggestGoldenCategory', () => {
  it('Android с заполненным uaData.model — android-vendor-ua-ch', () => {
    const suggestion = suggestGoldenCategory({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile',
      uaData: { platform: 'Android', mobile: true, model: 'SM-S928B' },
    });
    expect(suggestion.category).toBe('android-vendor-ua-ch');
    expect(suggestion.reason).toContain('SM-S928B');
    expect(
      suggestGoldenSource({
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile',
        uaData: { platform: 'Android', mobile: true, model: 'SM-S928B' },
      }),
    ).toBeUndefined();
  });

  it('модель K или пустая — android-no-ua-ch, не догадка по вендору', () => {
    expect(
      suggestGoldenCategory({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile',
        uaData: { platform: 'Android', mobile: true, model: '' },
      }).category,
    ).toBe('android-no-ua-ch');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile',
        uaData: { platform: 'Android', mobile: true, model: 'K' },
      }).category,
    ).toBe('android-no-ua-ch');
  });

  it('iPhone — iphone-generations; iPad — tablet', () => {
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)',
      }).category,
    ).toBe('iphone-generations');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      }).category,
    ).toBe('tablet');
  });

  it('WebView, десктоп, эмуляция и неоднозначный Mac выбираются по сигналам', () => {
    expect(
      suggestGoldenCategory({
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile',
      }).category,
    ).toBe('webview');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',
      }).category,
    ).toBe('desktop-browser');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        hardware: { maxTouchPoints: 0 },
      }).category,
    ).toBe('devtools-emulation');
    expect(
      suggestGoldenSource({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        hardware: { maxTouchPoints: 0 },
      }),
    ).toBe('browser-emulation');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      }).category,
    ).toBe('ambiguous-signature');
    expect(
      suggestGoldenCategory({
        userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
      }).category,
    ).toBe('non-standard-browser');
  });

  it('не берёт категорию из посторонних полей и не падает на мусоре', () => {
    expect(suggestGoldenCategory(null).category).toBe('ambiguous-signature');
    expect(suggestGoldenCategory('не объект').category).toBe('ambiguous-signature');
  });
});

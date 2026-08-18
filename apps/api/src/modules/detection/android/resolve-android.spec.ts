import { buildAliasIndex, type MatcherDevice } from '@esim-detector/fuzzy-matcher';

import { resolveAndroidDevice } from './resolve-android';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'device',
    brand: 'samsung',
    family: 'galaxy-s',
    generation: 24,
    modifiers: ['ultra'],
    modelCodes: ['SM-S928B'],
    aliases: ['galaxy s24 ultra'],
    marketingName: 'Galaxy S24 Ultra',
    popularity: 1,
    ...overrides,
  };
}

describe('resolveAndroidDevice', () => {
  it('находит устройство по точному сервисному коду в Sec-CH-UA-Model', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice({ uaData: { model: 'SM-S928B' } }, index);

    expect(result.deviceId).toBe('device');
    expect(result.method).toBe('ua_client_hints_model');
    expect(result.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['UA_CH_MODEL_RECEIVED', 'CATALOG_EXACT_MATCH']),
    );
  });

  it('находит устройство по маркетинговому названию в uaData.model (Google Pixel)', () => {
    const pixel = buildDevice({
      id: 'google-pixel-8-pro',
      brand: 'google',
      family: 'pixel',
      modifiers: ['pro'],
      generation: 8,
      modelCodes: [],
      aliases: [],
      marketingName: 'Pixel 8 Pro',
    });
    const index = buildAliasIndex([pixel]);
    const result = resolveAndroidDevice({ uaData: { model: 'Pixel 8 Pro' } }, index);

    expect(result.deviceId).toBe('google-pixel-8-pro');
    expect(result.method).toBe('ua_client_hints_model');
  });

  it('игнорирует модель "K" (урезанный UA-CH) и не пытается угадать', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice({ uaData: { model: 'K' } }, index);

    expect(result.deviceId).toBeUndefined();
    expect(result.reasons.some((r) => r.code === 'UA_CH_MODEL_MISSING_OR_GENERIC')).toBe(true);
  });

  it('код неизвестен справочнику → clarification (без угадывания), фиксирует причину', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice({ uaData: { model: 'SM-UNKNOWN99' } }, index);

    expect(result.deviceId).toBeUndefined();
    expect(result.method).toBe('unknown');
    expect(result.reasons.some((r) => r.code === 'CATALOG_MODEL_CODE_UNKNOWN')).toBe(true);
  });

  it('при отсутствии/урезанном uaData.model разбирает устаревший User-Agent (Firefox для Android)', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice(
      { uaData: { model: 'K' }, userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-S928B)' },
      index,
    );

    expect(result.deviceId).toBe('device');
    expect(result.method).toBe('legacy_user_agent_model');
  });

  it('модель из устаревшего User-Agent тоже неизвестна справочнику → unknown, без угадывания', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice(
      { uaData: { model: 'K' }, userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-UNKNOWN99)' },
      index,
    );

    expect(result.deviceId).toBeUndefined();
    expect(result.method).toBe('unknown');
    expect(
      result.reasons.filter((r) => r.code === 'CATALOG_MODEL_CODE_UNKNOWN').map((r) => r.detail),
    ).toEqual(['SM-UNKNOWN99']);
  });

  it('ни один источник не даёт результата → unknown, без деградации в догадку', () => {
    const index = buildAliasIndex([buildDevice()]);
    const result = resolveAndroidDevice({}, index);

    expect(result.deviceId).toBeUndefined();
    expect(result.method).toBe('unknown');
  });
});

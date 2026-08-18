import {
  parseAndroidVersionFromUserAgent,
  parseIosVersionFromUserAgent,
  parseLegacyAndroidModelFromUserAgent,
} from './parse-user-agent';

describe('parseIosVersionFromUserAgent', () => {
  it('извлекает major.minor из "CPU iPhone OS 18_5 like Mac OS X"', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15';
    expect(parseIosVersionFromUserAgent(ua)).toBe('18.5');
  });

  it('извлекает версию для iPad ("CPU OS", без "iPhone")', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)';
    expect(parseIosVersionFromUserAgent(ua)).toBe('17.4');
  });

  it('игнорирует патч-версию (17_4_1 → "17.4")', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)';
    expect(parseIosVersionFromUserAgent(ua)).toBe('17.4');
  });

  it('возвращает undefined, если версии в строке нет', () => {
    expect(parseIosVersionFromUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBeUndefined();
  });

  it('возвращает undefined, если User-Agent не передан', () => {
    expect(parseIosVersionFromUserAgent(undefined)).toBeUndefined();
  });
});

describe('parseAndroidVersionFromUserAgent', () => {
  it('извлекает версию Android из строки UA', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14.0.0; SM-S928B)';
    expect(parseAndroidVersionFromUserAgent(ua)).toBe('14.0.0');
  });

  it('возвращает undefined без строки Android', () => {
    expect(parseAndroidVersionFromUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBeUndefined();
  });

  it('возвращает undefined, если User-Agent не передан', () => {
    expect(parseAndroidVersionFromUserAgent(undefined)).toBeUndefined();
  });
});

describe('parseLegacyAndroidModelFromUserAgent', () => {
  it('извлекает модель между версией Android и "Build/"', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 10; SM-G973F Build/QP1A.190711.020) AppleWebKit/537.36';
    expect(parseLegacyAndroidModelFromUserAgent(ua)).toBe('SM-G973F');
  });

  it('извлекает модель без "Build/" (просто до закрывающей скобки)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7)';
    expect(parseLegacyAndroidModelFromUserAgent(ua)).toBe('Pixel 7');
  });

  it('плейсхолдер "K" трактуется как отсутствие модели', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
    expect(parseLegacyAndroidModelFromUserAgent(ua)).toBeUndefined();
  });

  it('возвращает undefined без строки Android', () => {
    expect(parseLegacyAndroidModelFromUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBeUndefined();
  });

  it('возвращает undefined, если User-Agent не передан', () => {
    expect(parseLegacyAndroidModelFromUserAgent(undefined)).toBeUndefined();
  });
});

import { detectEmulation } from './detect-emulation';

describe('detectEmulation', () => {
  it('не подозревает эмуляцию на десктопной платформе даже с maxTouchPoints=0', () => {
    const result = detectEmulation({
      platform: 'other',
      signals: { hardware: { maxTouchPoints: 0 } },
    });
    expect(result.suspected).toBe(false);
  });

  it('подозревает эмуляцию: заявлен iOS, но maxTouchPoints=0', () => {
    const result = detectEmulation({
      platform: 'ios',
      signals: { hardware: { maxTouchPoints: 0 } },
    });
    expect(result.suspected).toBe(true);
    expect(result.details[0]).toContain('maxTouchPoints');
  });

  it('подозревает эмуляцию: мобильный UA, но рендерер WebGL — SwiftShader (программный)', () => {
    const result = detectEmulation({
      platform: 'android',
      signals: { webgl: { vendor: 'Google Inc.', renderer: 'Google SwiftShader' } },
    });
    expect(result.suspected).toBe(true);
  });

  it('не подозревает эмуляцию на реальном мобильном GPU (Adreno)', () => {
    const result = detectEmulation({
      platform: 'android',
      signals: {
        hardware: { maxTouchPoints: 5 },
        webgl: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' },
      },
    });
    expect(result.suspected).toBe(false);
  });

  it('не путает Apple GPU (легитимен на iPad с Apple Silicon) с эмуляцией', () => {
    const result = detectEmulation({
      platform: 'ios',
      signals: {
        hardware: { maxTouchPoints: 5 },
        webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
      },
    });
    expect(result.suspected).toBe(false);
  });

  it('без сигналов вовсе не подозревает эмуляцию (нет данных — не повод для догадки)', () => {
    const result = detectEmulation({ platform: 'android', signals: undefined });
    expect(result.suspected).toBe(false);
  });
});

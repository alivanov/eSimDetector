import { classifyPlatform } from './classify-platform';

describe('classifyPlatform', () => {
  it('распознаёт iOS по строке User-Agent Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
    expect(classifyPlatform({ userAgent: ua })).toBe('ios');
  });

  it('распознаёт iPadOS по строке User-Agent', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
    expect(classifyPlatform({ userAgent: ua })).toBe('ios');
  });

  it('распознаёт Android по строке User-Agent, даже без uaData', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36';
    expect(classifyPlatform({ userAgent: ua })).toBe('android');
  });

  it('распознаёт HarmonyOS по строке User-Agent', () => {
    const ua = 'Mozilla/5.0 (Phone; HarmonyOS 4.0) AppleWebKit/537.36';
    expect(classifyPlatform({ userAgent: ua })).toBe('harmonyos');
  });

  it('распознаёт HarmonyOS NEXT по реальному образцу UA браузера Huawei (docs/09 ADR-024, п.2, этап 5.5): платформа названа "OpenHarmony", а не "HarmonyOS", при этом рядом присутствует токен совместимости "Android 10"', () => {
    const ua =
      'Mozilla/5.0 (Phone; OpenHarmony 6.0; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 ArkWeb/6.0.0.130 Mobile HuaweiBrowser/5.1.12.351';
    expect(classifyPlatform({ userAgent: ua })).toBe('harmonyos');
  });

  it('распознаёт Android по урезанному UA ("K") через uaData.platform', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
    expect(classifyPlatform({ userAgent: ua, uaData: { platform: 'Android' } })).toBe('android');
  });

  it('распознаёт HarmonyOS через uaData.platform, если строка UA его не называет', () => {
    expect(classifyPlatform({ userAgent: 'Mozilla/5.0', uaData: { platform: 'HarmonyOS' } })).toBe(
      'harmonyos',
    );
  });

  it('распознаёт iOS/iPadOS через uaData.platform, если строка UA его не называет', () => {
    expect(classifyPlatform({ userAgent: 'Mozilla/5.0', uaData: { platform: 'iOS' } })).toBe('ios');
    expect(classifyPlatform({ userAgent: 'Mozilla/5.0', uaData: { platform: 'iPadOS' } })).toBe(
      'ios',
    );
  });

  it('возвращает "other" для десктопного User-Agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(classifyPlatform({ userAgent: ua })).toBe('other');
  });

  it('возвращает "other", если сигналов нет вовсе', () => {
    expect(classifyPlatform(undefined)).toBe('other');
  });

  it('приоритет отдаётся User-Agent: явный признак iOS в UA перекрывает противоречивый uaData.platform', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
    expect(classifyPlatform({ userAgent: ua, uaData: { platform: 'Android' } })).toBe('ios');
  });

  describe('iPad в режиме настольного сайта (docs/09 ADR-034, ловушка iPadOS 13+)', () => {
    const desktopSafariUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

    it('User-Agent настольного macOS Safari + maxTouchPoints > 0 → ios (это iPad, а не Mac)', () => {
      expect(
        classifyPlatform({ userAgent: desktopSafariUa, hardware: { maxTouchPoints: 5 } }),
      ).toBe('ios');
    });

    it('тот же User-Agent с maxTouchPoints = 0 (настоящий Mac) → other, а не ios', () => {
      expect(
        classifyPlatform({ userAgent: desktopSafariUa, hardware: { maxTouchPoints: 0 } }),
      ).toBe('other');
    });

    it('тот же User-Agent без сигнала maxTouchPoints вовсе → other (не догадка про планшет)', () => {
      expect(classifyPlatform({ userAgent: desktopSafariUa })).toBe('other');
    });

    it('Chrome на настоящем десктопном Mac (не Safari) с maxTouchPoints > 0 тоже классифицируется как ios', () => {
      // Намеренное следствие эвристики: Mac с сенсорным экраном не существует на практике (docs/03
      // §3.9а), поэтому сочетание "Macintosh в UA" + "maxTouchPoints > 0" остаётся надёжным
      // различителем iPad независимо от конкретного браузера в UA.
      const chromeOnMacUa =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
      expect(classifyPlatform({ userAgent: chromeOnMacUa, hardware: { maxTouchPoints: 5 } })).toBe(
        'ios',
      );
    });
  });
});

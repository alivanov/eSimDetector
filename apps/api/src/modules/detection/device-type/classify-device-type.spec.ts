import { classifyDeviceType } from './classify-device-type';

describe('classifyDeviceType', () => {
  describe('iOS', () => {
    it('User-Agent iPhone → phone', () => {
      const result = classifyDeviceType('ios', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)',
      });
      expect(result).toEqual({ deviceType: 'phone', ambiguous: false, reasons: [] });
    });

    it('User-Agent iPad (явный токен) → tablet', () => {
      const result = classifyDeviceType('ios', {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)',
      });
      expect(result.deviceType).toBe('tablet');
      expect(result.ambiguous).toBe(false);
      expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_TABLET_DETECTED')).toBe(true);
    });

    it('iPad с User-Agent настольного Safari (iPadOS 13+) и maxTouchPoints > 0 → tablet, не ambiguous', () => {
      const result = classifyDeviceType('ios', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        hardware: { maxTouchPoints: 5 },
      });
      expect(result.deviceType).toBe('tablet');
      expect(result.ambiguous).toBe(false);
    });

    it('UA без явного iPhone/iPad/Mac (устаревший формат) по умолчанию — phone', () => {
      const result = classifyDeviceType('ios', {
        userAgent: 'Mozilla/5.0 (CPU OS 12_5 like Mac OS X)',
      });
      expect(result.deviceType).toBe('phone');
    });
  });

  describe('Android / HarmonyOS', () => {
    it('uaData.mobile=false → tablet', () => {
      const result = classifyDeviceType('android', { uaData: { mobile: false } });
      expect(result.deviceType).toBe('tablet');
      expect(result.ambiguous).toBe(false);
    });

    it('uaData.mobile=true → phone', () => {
      const result = classifyDeviceType('android', { uaData: { mobile: true } });
      expect(result.deviceType).toBe('phone');
    });

    it('uaData.mobile отсутствует, экран телефонного размера → phone, не ambiguous', () => {
      const result = classifyDeviceType('android', { screen: { width: 384, height: 832 } });
      expect(result.deviceType).toBe('phone');
      expect(result.ambiguous).toBe(false);
    });

    it('uaData.mobile отсутствует, экран планшетного размера → tablet, но ambiguous (не догадка)', () => {
      const result = classifyDeviceType('harmonyos', { screen: { width: 800, height: 1280 } });
      expect(result.deviceType).toBe('tablet');
      expect(result.ambiguous).toBe(true);
      expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_AMBIGUOUS')).toBe(true);
    });

    it('никаких сигналов вовсе → phone по умолчанию (сохранение прежнего поведения)', () => {
      const result = classifyDeviceType('android', undefined);
      expect(result.deviceType).toBe('phone');
      expect(result.ambiguous).toBe(false);
    });
  });

  describe('часы — распознаются раньше платформы', () => {
    it('User-Agent содержит "Watch" → watch независимо от платформы', () => {
      const result = classifyDeviceType('android', {
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Wear OS) AppleWebKit/537.36',
      });
      expect(result.deviceType).toBe('watch');
      expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_WATCH_DETECTED')).toBe(true);
    });

    it('Sec-CH-UA-Model содержит "Watch" → watch, даже если User-Agent молчит', () => {
      const result = classifyDeviceType('android', {
        userAgent: 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36',
        uaData: { model: 'SM-L315F Galaxy Watch7' },
      });
      expect(result.deviceType).toBe('watch');
    });
  });

  describe('десктоп ("other")', () => {
    it('настоящий Windows UA → other, не ambiguous', () => {
      const result = classifyDeviceType('other', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      expect(result).toEqual({ deviceType: 'other', ambiguous: false, reasons: [] });
    });

    it('Mac UA с maxTouchPoints=0 (настоящий Mac) → other, не ambiguous, не планшет', () => {
      const result = classifyDeviceType('other', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15',
        hardware: { maxTouchPoints: 0 },
      });
      expect(result).toEqual({ deviceType: 'other', ambiguous: false, reasons: [] });
    });

    it('Mac UA без сигнала maxTouchPoints вовсе → ambiguous: настоящий Mac или iPad неотличимы', () => {
      const result = classifyDeviceType('other', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15',
      });
      expect(result.deviceType).toBe('other');
      expect(result.ambiguous).toBe(true);
      expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_AMBIGUOUS')).toBe(true);
    });
  });
});

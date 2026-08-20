import { isDeviceType, isDualSimMode, isEsimSupport, isPlatform, isResultStatus } from './enums';

describe('enums', () => {
  it('isResultStatus', () => {
    expect(isResultStatus('supported')).toBe(true);
    expect(isResultStatus('not_supported')).toBe(true);
    expect(isResultStatus('clarification_required')).toBe(true);
    expect(isResultStatus('unknown')).toBe(false);
    expect(isResultStatus(1)).toBe(false);
  });

  it('isPlatform', () => {
    expect(isPlatform('ios')).toBe(true);
    expect(isPlatform('android')).toBe(true);
    expect(isPlatform('harmonyos')).toBe(true);
    expect(isPlatform('other')).toBe(true);
    expect(isPlatform('windows')).toBe(false);
  });

  it('isDeviceType', () => {
    expect(isDeviceType('phone')).toBe(true);
    expect(isDeviceType('tablet')).toBe(true);
    expect(isDeviceType('watch')).toBe(true);
    expect(isDeviceType('laptop')).toBe(true);
    expect(isDeviceType('other')).toBe(true);
    expect(isDeviceType('tv')).toBe(false);
  });

  it('isEsimSupport', () => {
    expect(isEsimSupport('supported')).toBe(true);
    expect(isEsimSupport('conditional')).toBe(true);
    expect(isEsimSupport('maybe')).toBe(false);
  });

  it('isDualSimMode', () => {
    expect(isDualSimMode('physical+esim')).toBe(true);
    expect(isDualSimMode('none')).toBe(true);
    expect(isDualSimMode('other')).toBe(false);
  });
});

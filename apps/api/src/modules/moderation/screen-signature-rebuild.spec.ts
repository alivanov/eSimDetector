import { buildSampleDevice } from '@esim-detector/contracts';

import { buildSignatureString, collectDevicesForSignature } from './screen-signature-rebuild';

describe('buildSignatureString', () => {
  it('форматирует cssWidth x cssHeight @ dpr', () => {
    expect(buildSignatureString({ cssWidth: 393, cssHeight: 852, dpr: 3 })).toBe('393x852@3');
  });
});

describe('collectDevicesForSignature', () => {
  const iosDevice = buildSampleDevice({
    _id: 'apple-iphone-14-pro',
    platform: 'ios',
    screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
  });

  it('находит активные устройства iOS с совпадающей сигнатурой', () => {
    const { matches, zoomed } = collectDevicesForSignature([iosDevice], '393x852@3');

    expect(matches).toEqual([iosDevice]);
    expect(zoomed).toBe(false);
  });

  it('пропускает устройства другой платформы (не iOS)', () => {
    const androidDevice = buildSampleDevice({
      _id: 'samsung-galaxy-s24-ultra',
      platform: 'android',
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
    });

    const { matches } = collectDevicesForSignature([androidDevice], '393x852@3');

    expect(matches).toEqual([]);
  });

  it('пропускает устаревшие (deprecated) записи', () => {
    const deprecatedDevice = buildSampleDevice({
      _id: 'apple-iphone-13',
      platform: 'ios',
      status: 'deprecated',
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
    });

    const { matches } = collectDevicesForSignature([deprecatedDevice], '393x852@3');

    expect(matches).toEqual([]);
  });

  it('пропускает устройства без совпадающей сигнатуры среди своих', () => {
    const otherSignatureDevice = buildSampleDevice({
      _id: 'apple-iphone-se-2020',
      platform: 'ios',
      screenSignatures: [{ cssWidth: 375, cssHeight: 667, dpr: 2, zoomed: false }],
    });

    const { matches } = collectDevicesForSignature([otherSignatureDevice], '393x852@3');

    expect(matches).toEqual([]);
  });

  it('возвращает zoomed из ПЕРВОГО найденного совпадения', () => {
    const zoomedDevice = buildSampleDevice({
      _id: 'apple-iphone-14-pro-zoomed',
      platform: 'ios',
      screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: true }],
    });

    const { matches, zoomed } = collectDevicesForSignature([zoomedDevice, iosDevice], '393x852@3');

    expect(matches).toHaveLength(2);
    expect(zoomed).toBe(true);
  });

  it('на пустом входе возвращает пустой список и zoomed=false', () => {
    expect(collectDevicesForSignature([], '393x852@3')).toEqual({ matches: [], zoomed: false });
  });
});

import { buildScreenSignatureKey } from './build-screen-signature-key';

describe('buildScreenSignatureKey', () => {
  it('строит ключ из ширины/высоты/dpr, уже в портретной ориентации', () => {
    expect(buildScreenSignatureKey({ width: 393, height: 852, dpr: 3 })).toBe('393x852@3');
  });

  it('переставляет ширину и высоту, когда сигналы пришли в альбомной ориентации', () => {
    expect(
      buildScreenSignatureKey({
        width: 852,
        height: 393,
        dpr: 3,
        orientation: 'landscape-primary',
      }),
    ).toBe('393x852@3');
  });

  it('форматирует нецелый dpr без хвостовых нулей', () => {
    expect(buildScreenSignatureKey({ width: 384, height: 832, dpr: 3.75 })).toBe('384x832@3.75');
  });

  it('возвращает undefined, если не хватает хотя бы одного из трёх измерений', () => {
    expect(buildScreenSignatureKey({ width: 393, height: 852 })).toBeUndefined();
    expect(buildScreenSignatureKey(undefined)).toBeUndefined();
  });
});

import { collectSignals, createBrowserSignalsSource } from './index';
import type { SignalsSource, WindowLike } from './index';

describe('index — публичная поверхность пакета signals-collector', () => {
  it('экспортирует collectSignals', async () => {
    const source: SignalsSource = {
      navigator: { userAgent: 'UA' },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    expect(await collectSignals(source)).toEqual({ userAgent: 'UA' });
  });

  it('экспортирует createBrowserSignalsSource', () => {
    const win: WindowLike = {
      navigator: { userAgent: 'UA' },
      screen: {},
      devicePixelRatio: 2,
      document: { createElement: () => ({ getContext: () => null }) },
    };
    const source = createBrowserSignalsSource(win);
    expect(source.devicePixelRatio).toBe(2);
    expect(source.createWebglProbe()?.readVendorAndRenderer()).toBeNull();
  });
});

import { createBrowserSignalsSource } from './browser-source';
import type {
  CanvasLike,
  WebglRenderingContextLike,
  WindowLike,
  WebglDebugRendererInfoExtensionLike,
} from './browser-source';

const UNMASKED_VENDOR_WEBGL = 0x9245;
const UNMASKED_RENDERER_WEBGL = 0x9246;

function buildWindow(canvas: CanvasLike): WindowLike {
  return {
    navigator: { userAgent: 'UA' },
    screen: { width: 390, height: 844 },
    devicePixelRatio: 3,
    document: {
      createElement: () => canvas,
    },
  };
}

function buildWorkingContext(vendor: string, renderer: string): WebglRenderingContextLike {
  const extension: WebglDebugRendererInfoExtensionLike = {
    UNMASKED_VENDOR_WEBGL,
    UNMASKED_RENDERER_WEBGL,
  };
  const parameters = new Map<number, unknown>([
    [UNMASKED_VENDOR_WEBGL, vendor],
    [UNMASKED_RENDERER_WEBGL, renderer],
  ]);
  return {
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? extension : null),
    getParameter: (parameterName) => parameters.get(parameterName),
  };
}

describe('createBrowserSignalsSource', () => {
  it('переносит navigator/screen/devicePixelRatio без изменений', () => {
    const canvas: CanvasLike = { getContext: () => null };
    const win = buildWindow(canvas);
    const source = createBrowserSignalsSource(win);

    expect(source.navigator).toBe(win.navigator);
    expect(source.screen).toBe(win.screen);
    expect(source.devicePixelRatio).toBe(3);
  });

  it('createWebglProbe().readVendorAndRenderer() возвращает вендор и рендерер при рабочем WebGL', () => {
    const context = buildWorkingContext('Qualcomm', 'Adreno (TM) 750');
    const canvas: CanvasLike = { getContext: (id) => (id === 'webgl' ? context : null) };
    const source = createBrowserSignalsSource(buildWindow(canvas));

    const probe = source.createWebglProbe();
    expect(probe).not.toBeNull();
    expect(probe?.readVendorAndRenderer()).toEqual({
      vendor: 'Qualcomm',
      renderer: 'Adreno (TM) 750',
    });
  });

  it('перебирает experimental-webgl, если webgl недоступен', () => {
    const context = buildWorkingContext('Apple', 'Apple GPU');
    const canvas: CanvasLike = {
      getContext: (id) => (id === 'experimental-webgl' ? context : null),
    };
    const source = createBrowserSignalsSource(buildWindow(canvas));

    expect(source.createWebglProbe()?.readVendorAndRenderer()).toEqual({
      vendor: 'Apple',
      renderer: 'Apple GPU',
    });
  });

  it('возвращает null, если ни один контекст WebGL не создался', () => {
    const canvas: CanvasLike = { getContext: () => null };
    const source = createBrowserSignalsSource(buildWindow(canvas));

    expect(source.createWebglProbe()?.readVendorAndRenderer()).toBeNull();
  });

  it('возвращает null, если расширение WEBGL_debug_renderer_info недоступно', () => {
    const context: WebglRenderingContextLike = {
      getExtension: () => null,
      getParameter: () => null,
    };
    const canvas: CanvasLike = { getContext: () => context };
    const source = createBrowserSignalsSource(buildWindow(canvas));

    expect(source.createWebglProbe()?.readVendorAndRenderer()).toBeNull();
  });

  it('возвращает null, если getParameter вернул не строку', () => {
    const extension: WebglDebugRendererInfoExtensionLike = {
      UNMASKED_VENDOR_WEBGL,
      UNMASKED_RENDERER_WEBGL,
    };
    const context: WebglRenderingContextLike = {
      getExtension: () => extension,
      getParameter: () => undefined,
    };
    const canvas: CanvasLike = { getContext: () => context };
    const source = createBrowserSignalsSource(buildWindow(canvas));

    expect(source.createWebglProbe()?.readVendorAndRenderer()).toBeNull();
  });

  it('canvas создаётся лениво — только при вызове createWebglProbe()', () => {
    let createElementCalls = 0;
    const canvas: CanvasLike = { getContext: () => null };
    const win: WindowLike = {
      navigator: {},
      screen: {},
      devicePixelRatio: 1,
      document: {
        createElement: () => {
          createElementCalls += 1;
          return canvas;
        },
      },
    };

    const source = createBrowserSignalsSource(win);
    expect(createElementCalls).toBe(0);
    source.createWebglProbe();
    expect(createElementCalls).toBe(1);
  });
});

import type { NavigatorLike, ScreenLike, SignalsSource, WebglProbe } from './signals-source';

/**
 * Тонкий адаптер поверх `window`, вынесенный отдельной функцией (`createBrowserSignalsSource`
 * ниже) — единственное место пакета, которое моделирует реальный браузерный `WebGLRenderingContext`
 * и константы расширения `WEBGL_debug_renderer_info`. `collectSignals` (`./collect-signals.ts`)
 * этих деталей не видит: получает уже готовый `WebglProbe.readVendorAndRenderer()`.
 */

export interface WebglDebugRendererInfoExtensionLike {
  readonly UNMASKED_VENDOR_WEBGL: number;
  readonly UNMASKED_RENDERER_WEBGL: number;
}

export interface WebglRenderingContextLike {
  getExtension(name: string): WebglDebugRendererInfoExtensionLike | null;
  getParameter(parameterName: number): unknown;
}

export interface CanvasLike {
  getContext(contextId: string): WebglRenderingContextLike | null;
}

export interface DocumentLike {
  createElement(tagName: string): CanvasLike;
}

export interface WindowLike {
  readonly navigator: NavigatorLike;
  readonly screen: ScreenLike;
  readonly devicePixelRatio: number;
  readonly document: DocumentLike;
}

/**
 * Два имени контекста WebGL, которые встречаются у настоящих браузеров в этом порядке
 * (`experimental-webgl` — старые сборки, добавленные до финализации спецификации).
 */
const WEBGL_CONTEXT_IDS: readonly string[] = ['webgl', 'experimental-webgl'];

function getWebglContext(canvas: CanvasLike): WebglRenderingContextLike | null {
  for (const contextId of WEBGL_CONTEXT_IDS) {
    const context = canvas.getContext(contextId);
    if (context !== null) {
      return context;
    }
  }
  return null;
}

function readVendorAndRenderer(canvas: CanvasLike): { vendor: string; renderer: string } | null {
  const gl = getWebglContext(canvas);
  if (gl === null) {
    return null;
  }
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  if (extension === null) {
    return null;
  }
  const vendor = gl.getParameter(extension.UNMASKED_VENDOR_WEBGL);
  const renderer = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
  if (typeof vendor !== 'string' || typeof renderer !== 'string') {
    return null;
  }
  return { vendor, renderer };
}

/**
 * Строит `SignalsSource` (`./signals-source.ts`) поверх объекта, структурно совпадающего с
 * глобальным `window`. Создание канваса и обращение к WebGL отложено до вызова
 * `createWebglProbe()` — до этого момента `apps/web`/`apps/widget` могут даже не отрисовывать
 * canvas в DOM.
 */
export function createBrowserSignalsSource(win: WindowLike): SignalsSource {
  return {
    navigator: win.navigator,
    screen: win.screen,
    devicePixelRatio: win.devicePixelRatio,
    createWebglProbe(): WebglProbe | null {
      const canvas = win.document.createElement('canvas');
      return {
        readVendorAndRenderer: () => readVendorAndRenderer(canvas),
      };
    },
  };
}

/**
 * Форма ВНЕДРЯЕМОГО источника сигналов — алгоритм `collectSignals` (`./collect-signals.ts`) не
 * обращается к глобальному `navigator`/`screen`/`window` напрямую (.cursor/rules/pure-packages.mdc:
 * пакет остаётся тестируемым без браузера), а получает их параметром. Тонкий адаптер поверх
 * реального `window` — `createBrowserSignalsSource` (`./browser-source.ts`).
 */

export interface UaBrandLike {
  readonly brand: string;
  readonly version: string;
}

/** Высокоэнтропийные значения `navigator.userAgentData.getHighEntropyValues()` (docs/03 §3.2). */
export interface HighEntropyValuesLike {
  readonly model?: string;
  readonly platformVersion?: string;
  readonly fullVersionList?: readonly UaBrandLike[];
  readonly architecture?: string;
  readonly bitness?: string;
}

export interface NavigatorUaDataLike {
  readonly platform?: string;
  readonly mobile?: boolean;
  readonly brands?: readonly UaBrandLike[];
  getHighEntropyValues(hints: readonly string[]): Promise<HighEntropyValuesLike>;
}

export interface NavigatorLike {
  readonly userAgent?: string;
  readonly userAgentData?: NavigatorUaDataLike;
  readonly maxTouchPoints?: number;
  readonly hardwareConcurrency?: number;
  /** Нестандартное API (`navigator.deviceMemory`), недоступно в Safari (docs/03 §3.2). */
  readonly deviceMemory?: number;
}

export interface ScreenOrientationLike {
  readonly type?: string;
}

export interface ScreenLike {
  readonly width?: number;
  readonly height?: number;
  readonly availWidth?: number;
  readonly availHeight?: number;
  readonly orientation?: ScreenOrientationLike;
}

/**
 * Итог зонда WebGL — уже вендор/рендерер, а не сырой `WebGLRenderingContext`: константы
 * расширения `WEBGL_debug_renderer_info` (`UNMASKED_VENDOR_WEBGL`/`UNMASKED_RENDERER_WEBGL`) и
 * сама работа с canvas — деталь браузерного адаптера (`./browser-source.ts`), алгоритму она не
 * нужна и не должна быть видна (иначе пакет перестал бы быть тестируемым без канваса).
 */
export interface WebglProbe {
  readVendorAndRenderer(): { readonly vendor: string; readonly renderer: string } | null;
}

export interface SignalsSource {
  readonly navigator: NavigatorLike;
  readonly screen: ScreenLike;
  readonly devicePixelRatio: number;
  createWebglProbe(): WebglProbe | null;
}

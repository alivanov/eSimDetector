/**
 * Доменные типы сигналов устройства (docs/03-detection-algorithm.md, §3.2) — обычные интерфейсы
 * БЕЗ декораторов `class-validator`, используемые чистыми функциями алгоритма (`platform/`,
 * `android/`, `ios/`, `emulation/`). DTO запроса (`dto/detect-request.dto.ts`) описывает ТУ ЖЕ
 * форму данных декорированными классами для валидации на границе (ADR-016) — структурная
 * типизация TypeScript делает экземпляр DTO совместимым с этими интерфейсами без отдельного
 * шага отображения, а сами функции алгоритма остаются независимыми от `class-validator`.
 */

export interface UaBrandSignal {
  readonly brand: string;
  readonly version: string;
}

export interface UaDataSignals {
  readonly platform?: string;
  readonly mobile?: boolean;
  readonly model?: string;
  readonly platformVersion?: string;
  readonly brands?: readonly UaBrandSignal[];
  readonly fullVersionList?: readonly UaBrandSignal[];
  readonly architecture?: string;
  readonly bitness?: string;
}

export interface ScreenSignals {
  readonly width?: number;
  readonly height?: number;
  readonly availWidth?: number;
  readonly availHeight?: number;
  readonly dpr?: number;
  readonly orientation?: string;
}

export interface HardwareSignals {
  readonly maxTouchPoints?: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
}

export interface WebglSignals {
  readonly vendor?: string;
  readonly renderer?: string;
}

export interface DetectionSignals {
  readonly userAgent?: string;
  readonly uaData?: UaDataSignals;
  readonly screen?: ScreenSignals;
  readonly hardware?: HardwareSignals;
  readonly webgl?: WebglSignals;
}

export interface RequestContext {
  readonly channel?: string;
  readonly locale?: string;
}

/** Заголовки, доступные серверу для перекрёстной проверки (docs/03 §3.2, последняя строка). */
export interface RequestHeaderSignals {
  readonly model?: string;
  readonly platform?: string;
}

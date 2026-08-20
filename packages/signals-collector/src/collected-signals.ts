/**
 * Форма результата `collectSignals` — ровно поле `signals` тела `POST /api/v1/detect`
 * (docs/06-api-contract.md §6.2), а не внутренний тип `DetectionSignals` модуля
 * `apps/api/src/modules/detection` (тот же принцип разделения границы API и внутреннего типа
 * модуля, что зафиксирован ADR-037 для `signals.golden.json`): пакет описывает то, что реально
 * уйдёт по сети на границу контракта, а не структуру, которая может измениться при рефакторинге
 * модуля `detection` без изменения самого контракта. Все поля необязательны — отсутствие сигнала
 * нормально (docs/03 §3.2, .cursor/rules/ui-and-widget.mdc) и выражается отсутствием поля в
 * объекте, а не `undefined`-значением (`exactOptionalPropertyTypes: true`, ADR-016).
 */

export interface CollectedUaBrand {
  readonly brand: string;
  readonly version: string;
}

export interface CollectedUaDataSignals {
  readonly platform?: string;
  readonly mobile?: boolean;
  readonly model?: string;
  readonly platformVersion?: string;
  readonly brands?: readonly CollectedUaBrand[];
  readonly fullVersionList?: readonly CollectedUaBrand[];
  readonly architecture?: string;
  readonly bitness?: string;
}

export interface CollectedScreenSignals {
  readonly width?: number;
  readonly height?: number;
  readonly availWidth?: number;
  readonly availHeight?: number;
  readonly dpr?: number;
  readonly orientation?: string;
}

export interface CollectedHardwareSignals {
  readonly maxTouchPoints?: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
}

export interface CollectedWebglSignals {
  readonly vendor?: string;
  readonly renderer?: string;
}

export interface CollectedSignals {
  readonly userAgent?: string;
  readonly uaData?: CollectedUaDataSignals;
  readonly screen?: CollectedScreenSignals;
  readonly hardware?: CollectedHardwareSignals;
  readonly webgl?: CollectedWebglSignals;
}

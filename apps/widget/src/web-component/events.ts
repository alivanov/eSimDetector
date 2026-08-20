import type { ClarificationKind, ClarificationOption } from '../api/clarification';
import type { DeviceType, Platform, ResultStatus } from '../api/enums';

/**
 * Формы `detail` шести событий жизненного цикла виджета (docs/07-integration.md §7.2,
 * docs/09-decisions.md ADR-040). Форма `esim:result` зафиксирована документом буквально
 * (`{ status, deviceId, confidence, exactModelKnown }`) — остальные пять определены здесь
 * этим этапом и описаны в docs/07 §7.2.
 */
export interface EsimReadyEventDetail {
  /** `data-channel` скрипта подключения, если он был указан — иначе `null`. */
  readonly channel: string | null;
}

export interface EsimDetectedEventDetail {
  readonly method: string;
  readonly platform: Platform;
  readonly deviceType: DeviceType;
  readonly exactModelKnown: boolean;
}

export interface EsimClarificationEventDetail {
  readonly kind: ClarificationKind;
  readonly question: string;
  readonly options: readonly ClarificationOption[];
}

export interface EsimResultEventDetail {
  readonly status: ResultStatus;
  readonly deviceId: string | null;
  readonly confidence: number;
  readonly exactModelKnown: boolean;
}

export interface EsimErrorEventDetail {
  readonly code: string;
  readonly message: string;
}

export interface EsimActionEventDetail {
  /** Сейчас единственное значение — клик по действию `kind: 'continue'` (docs/07 §7.2). */
  readonly kind: 'continue';
  readonly label: string;
  readonly deviceId: string | null;
  readonly status: ResultStatus;
  readonly confidence: number;
}

export interface EsimWidgetEventMap {
  'esim:ready': EsimReadyEventDetail;
  'esim:detected': EsimDetectedEventDetail;
  'esim:clarification': EsimClarificationEventDetail;
  'esim:result': EsimResultEventDetail;
  'esim:error': EsimErrorEventDetail;
  'esim:action': EsimActionEventDetail;
}

export const ESIM_WIDGET_EVENT_TYPES: readonly (keyof EsimWidgetEventMap)[] = [
  'esim:ready',
  'esim:detected',
  'esim:clarification',
  'esim:result',
  'esim:error',
  'esim:action',
];

/**
 * Публикует событие жизненного цикла на элементе виджета. `bubbles: true` и `composed: true`
 * ОБА обязательны (docs/07 §7.2): без `composed` событие не пересечёт границу теневого DOM и
 * заказчик, слушающий на контейнере страницы (`data-target`), его не увидит.
 */
export function dispatchWidgetEvent<K extends keyof EsimWidgetEventMap>(
  target: EventTarget,
  type: K,
  detail: EsimWidgetEventMap[K],
): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

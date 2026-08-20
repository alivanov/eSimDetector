import type { ApiErrorBody, DetectResponse } from '@esim-detector/widget';
import { parseApiErrorBody, parseDetectResponse } from '@esim-detector/widget';

/**
 * Отправляет `POST /api/v1/detect` с ПРОИЗВОЛЬНЫМ (в т.ч. заведомо некорректным) содержимым поля
 * `signals` — в отличие от `detect()` из `@esim-detector/widget` (`apps/widget/src/api/detect.ts`),
 * рассчитанного на уже собранные типизированные сигналы `CollectedSignals`. Стенд отладки
 * (docs/07-integration.md §7.6, ADR-010) обязан пропускать то, что ввёл оператор, без клиентской
 * проверки формы — валидацию выполняет сама граница API (docs/06-api-contract.md §6.5), а стенд
 * лишь показывает её результат, включая `VALIDATION_ERROR`. Поэтому этот модуль не переиспользует
 * типизированный `detect()`/`requestJson()`, а делает запрос напрямую, переиспользуя только разбор
 * ОТВЕТА (`parseDetectResponse`/`parseApiErrorBody`) — тот же приём для успешного и ошибочного тела.
 */
export interface DebugDetectContext {
  /** Только явное действие оператора (docs/06 §6.2, ADR-003) — стенд не выводит регион сам. */
  readonly region?: string;
}

export type DebugDetectOutcome =
  | { readonly kind: 'success'; readonly response: DetectResponse }
  | { readonly kind: 'api-error'; readonly error: ApiErrorBody }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'parse-error' };

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export async function sendDebugDetect(
  apiBase: string,
  signals: unknown,
  context?: DebugDetectContext,
): Promise<DebugDetectOutcome> {
  let response: Response;
  try {
    response = await fetch(joinUrl(apiBase, '/api/v1/detect'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        signals,
        ...(context !== undefined ? { context } : {}),
      }),
    });
  } catch {
    return { kind: 'network-error' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const errorBody = parseApiErrorBody(body);
    if (errorBody === undefined) {
      return { kind: 'network-error' };
    }
    return { kind: 'api-error', error: errorBody };
  }

  const parsed = parseDetectResponse(body);
  if (parsed === undefined) {
    return { kind: 'parse-error' };
  }
  return { kind: 'success', response: parsed };
}

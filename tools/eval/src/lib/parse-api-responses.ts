/**
 * Разбор ответов `/api/v1/detect` и `/api/v1/devices/search` без утверждений типа `as` (ADR-016) —
 * ответ HTTP-сервиса — такие же недоверенные внешние данные для этого инструмента, как CSV для
 * `tools/seed`. Проверяется только подмножество полей, нужное для метрик стенда (docs/08 §8.6);
 * полная сверка со схемой `@esim-detector/contracts`/DTO принадлежит e2e-тестам `apps/api`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParsedDetectResponse {
  readonly status: string;
  readonly deviceId: string | null;
  readonly platform: string;
  readonly deviceType: string;
  readonly exactModelKnown: boolean;
  readonly candidateCount: number;
}

export function parseDetectResponse(value: unknown, context: string): ParsedDetectResponse {
  if (!isRecord(value)) {
    throw new Error(`${context}: ответ /detect — не объект`);
  }
  const { status, device, detection, candidates } = value;
  if (typeof status !== 'string') {
    throw new Error(`${context}: status не строка`);
  }
  if (!isRecord(detection)) {
    throw new Error(`${context}: detection не объект`);
  }
  const { platform, deviceType, exactModelKnown } = detection;
  if (typeof platform !== 'string' || typeof deviceType !== 'string') {
    throw new Error(`${context}: detection.platform/deviceType не строки`);
  }
  if (typeof exactModelKnown !== 'boolean') {
    throw new Error(`${context}: detection.exactModelKnown не булево значение`);
  }
  let deviceId: string | null = null;
  if (device !== null) {
    if (!isRecord(device) || typeof device['id'] !== 'string') {
      throw new Error(`${context}: device.id не строка`);
    }
    deviceId = device['id'];
  }
  return {
    status,
    deviceId,
    platform,
    deviceType,
    exactModelKnown,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
  };
}

export interface ParsedSearchResponse {
  readonly status: string;
  readonly deviceId: string | null;
  readonly matchCount: number;
}

export function parseSearchResponse(value: unknown, context: string): ParsedSearchResponse {
  if (!isRecord(value)) {
    throw new Error(`${context}: ответ /devices/search — не объект`);
  }
  const { status, device, matches } = value;
  if (typeof status !== 'string') {
    throw new Error(`${context}: status не строка`);
  }
  let deviceId: string | null = null;
  if (device !== null) {
    if (!isRecord(device) || typeof device['id'] !== 'string') {
      throw new Error(`${context}: device.id не строка`);
    }
    deviceId = device['id'];
  }
  return {
    status,
    deviceId,
    matchCount: Array.isArray(matches) ? matches.length : 0,
  };
}

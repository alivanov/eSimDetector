import type { CollectedSignals } from '@esim-detector/signals-collector';

import type { Clarification } from './clarification';
import { parseClarification } from './clarification';
import type { CandidateSummary, DeviceSummary } from './device-summary';
import { parseCandidateSummaries, parseDeviceSummary } from './device-summary';
import type { DeviceType, Platform, ResultStatus } from './enums';
import { isDeviceType, isPlatform, isResultStatus } from './enums';
import { ApiParseError } from './error';
import { requestJson } from './http';
import type { Presentation } from './presentation';
import { parsePresentation } from './presentation';
import { isFiniteNumber, isNonEmptyString, isRecord } from './predicates';
import type { ApiReason } from './reason';
import { parseReasons } from './reason';

/**
 * Тело запроса `POST /api/v1/detect` (docs/06-api-contract.md §6.2). `signals` повторяет форму,
 * которую уже строит `collectSignals` пакета `@esim-detector/signals-collector` (ADR-038) —
 * поэтому здесь используется её тип напрямую, без повторного объявления полей.
 *
 * `context.region` заполняется ИСКЛЮЧИТЕЛЬНО прямым кликом пользователя по варианту
 * `clarification.options` (docs/06 §6.2, ADR-003, ADR-031 п.3) — этот модуль не содержит и не
 * должен содержать код, который выводит `region` из `context.locale`, часового пояса, geo-IP
 * или любого иного косвенного сигнала. Вызывающий код (`../components/EsimChecker.tsx`)
 * гарантирует это на уровне состояния: поле присутствует в теле запроса только во ВТОРОМ вызове
 * `detect()`, отправленном в ответ на обработчик клика по варианту вопроса уточнения.
 */
export interface DetectRequestContext {
  readonly channel?: string;
  readonly locale?: string;
  readonly region?: string;
}

export interface DetectRequestBody {
  readonly signals?: CollectedSignals;
  readonly context?: DetectRequestContext;
}

/** Открытая строка, а не закрытый union: реестр способов определения пополняется сервером. */
export type DetectionMethod = string;

export interface DetectionInfo {
  readonly method: DetectionMethod;
  readonly platform: Platform;
  readonly exactModelKnown: boolean;
  readonly deviceType: DeviceType;
}

/** Форма ответа `POST /api/v1/detect` (docs/06-api-contract.md §6.2). */
export interface DetectResponse {
  readonly requestId: string;
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly detection: DetectionInfo;
  readonly device: DeviceSummary | undefined;
  readonly candidates: readonly CandidateSummary[];
  readonly reasons: readonly ApiReason[];
  readonly clarification: Clarification | undefined;
  readonly presentation: Presentation;
}

function parseDetectionInfo(value: unknown): DetectionInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { method, platform, exactModelKnown, deviceType } = value;
  if (
    !isNonEmptyString(method) ||
    !isPlatform(platform) ||
    typeof exactModelKnown !== 'boolean' ||
    !isDeviceType(deviceType)
  ) {
    return undefined;
  }
  return { method, platform, exactModelKnown, deviceType };
}

/** Разбор ответа `/detect` предикатами, без утверждений `as` (ADR-016). */
export function parseDetectResponse(value: unknown): DetectResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const {
    requestId,
    status,
    confidence,
    detection,
    device,
    candidates,
    reasons,
    clarification,
    presentation,
  } = value;

  const parsedDetection = parseDetectionInfo(detection);
  const parsedDevice = parseDeviceSummary(device);
  const parsedCandidates = parseCandidateSummaries(candidates);
  const parsedReasons = parseReasons(reasons);
  const parsedClarification = parseClarification(clarification);
  const parsedPresentation = parsePresentation(presentation);

  if (
    !isNonEmptyString(requestId) ||
    !isResultStatus(status) ||
    !isFiniteNumber(confidence) ||
    parsedDetection === undefined ||
    (device !== null && parsedDevice === undefined) ||
    parsedCandidates === undefined ||
    parsedReasons === undefined ||
    (clarification !== undefined && parsedClarification === undefined) ||
    parsedPresentation === undefined
  ) {
    return undefined;
  }

  return {
    requestId,
    status,
    confidence,
    detection: parsedDetection,
    device: parsedDevice,
    candidates: parsedCandidates,
    reasons: parsedReasons,
    clarification: parsedClarification,
    presentation: parsedPresentation,
  };
}

/**
 * `POST /api/v1/detect` (docs/06-api-contract.md §6.2). `baseUrl` — параметр вызывающего кода
 * (ADR-027, «localhost в код не прошивается»), а не константа этого модуля.
 */
export async function detect(baseUrl: string, body: DetectRequestBody): Promise<DetectResponse> {
  const raw = await requestJson(baseUrl, { method: 'POST', path: '/api/v1/detect', body });
  const parsed = parseDetectResponse(raw);
  if (parsed === undefined) {
    throw new ApiParseError('/api/v1/detect');
  }
  return parsed;
}

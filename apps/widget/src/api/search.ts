import type { Clarification } from './clarification';
import { parseClarification } from './clarification';
import type { DeviceSummary, MatchSummary } from './device-summary';
import { parseDeviceSummary, parseMatchSummaries } from './device-summary';
import type { ResultStatus } from './enums';
import { isResultStatus } from './enums';
import { ApiParseError } from './error';
import { requestJson } from './http';
import type { Presentation } from './presentation';
import { parsePresentation } from './presentation';
import { isFiniteNumber, isNonEmptyString, isRecord } from './predicates';
import type { ApiReason } from './reason';
import { parseReasons } from './reason';

export interface SearchQuery {
  readonly raw: string;
  readonly normalized: string;
}

/** Форма ответа `GET/POST /api/v1/devices/search` (docs/06-api-contract.md §6.3). */
export interface SearchResponse {
  readonly requestId: string;
  readonly query: SearchQuery;
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly device: DeviceSummary | undefined;
  readonly matches: readonly MatchSummary[];
  readonly reasons: readonly ApiReason[];
  readonly clarification: Clarification | undefined;
  readonly presentation: Presentation;
}

function parseSearchQuery(value: unknown): SearchQuery | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { raw, normalized } = value;
  if (!isNonEmptyString(raw) || !isNonEmptyString(normalized)) {
    return undefined;
  }
  return { raw, normalized };
}

export function parseSearchResponse(value: unknown): SearchResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const {
    requestId,
    query,
    status,
    confidence,
    device,
    matches,
    reasons,
    clarification,
    presentation,
  } = value;

  const parsedQuery = parseSearchQuery(query);
  const parsedDevice = parseDeviceSummary(device);
  const parsedMatches = parseMatchSummaries(matches);
  const parsedReasons = parseReasons(reasons);
  const parsedClarification = parseClarification(clarification);
  const parsedPresentation = parsePresentation(presentation);

  if (
    !isNonEmptyString(requestId) ||
    parsedQuery === undefined ||
    !isResultStatus(status) ||
    !isFiniteNumber(confidence) ||
    (device !== null && parsedDevice === undefined) ||
    parsedMatches === undefined ||
    parsedReasons === undefined ||
    (clarification !== undefined && parsedClarification === undefined) ||
    parsedPresentation === undefined
  ) {
    return undefined;
  }

  return {
    requestId,
    query: parsedQuery,
    status,
    confidence,
    device: parsedDevice,
    matches: parsedMatches,
    reasons: parsedReasons,
    clarification: parsedClarification,
    presentation: parsedPresentation,
  };
}

/**
 * `POST /api/v1/devices/search` (docs/06-api-contract.md §6.3). `POST`, а не `GET` (объём этапа
 * 6.2): кириллица в теле запроса надёжнее, чем в строке запроса — избегает вопросов кодирования
 * URL и ограничений длины query-строки у некоторых промежуточных прокси. `GET` тот же самый
 * контракт принимает как алиас (реализация агента 5, docs/09 ADR-024 п.6), поэтому смены сервера
 * это решение не требует.
 *
 * `region` — ТОЛЬКО явный ответ пользователя на адресный вопрос уточнения (docs/06 §6.2/§6.3,
 * ADR-003, ADR-031 п.3), тот же принцип, что у `DetectRequestContext.region` (`./detect.ts`).
 */
export async function searchDevices(
  baseUrl: string,
  q: string,
  region?: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const raw = await requestJson(baseUrl, {
    method: 'POST',
    path: '/api/v1/devices/search',
    body: { q, ...(region !== undefined ? { region } : {}) },
    ...(signal !== undefined ? { signal } : {}),
  });
  const parsed = parseSearchResponse(raw);
  if (parsed === undefined) {
    throw new ApiParseError('/api/v1/devices/search');
  }
  return parsed;
}

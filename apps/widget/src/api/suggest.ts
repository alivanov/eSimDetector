import { ApiParseError } from './error';
import { requestJson } from './http';
import { isArrayOf, isNonEmptyString, isRecord } from './predicates';
import type { SearchQuery } from './search';

export interface SuggestItem {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
}

/** Форма ответа `GET /api/v1/devices/suggest` (docs/06-api-contract.md §6.4). */
export interface SuggestResponse {
  readonly requestId: string;
  readonly query: SearchQuery;
  readonly suggestions: readonly SuggestItem[];
}

function isSuggestItem(value: unknown): value is SuggestItem {
  return (
    isRecord(value) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['name']) &&
    isNonEmptyString(value['brand'])
  );
}

export function parseSuggestResponse(value: unknown): SuggestResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { requestId, query, suggestions } = value;
  if (!isRecord(query)) {
    return undefined;
  }
  const { raw, normalized } = query;
  if (
    !isNonEmptyString(requestId) ||
    !isNonEmptyString(raw) ||
    !isNonEmptyString(normalized) ||
    !isArrayOf(suggestions, isSuggestItem)
  ) {
    return undefined;
  }
  return {
    requestId,
    query: { raw, normalized },
    suggestions,
  };
}

/** Не больше 10 подсказок — сервер не отдаёт больше независимо от переданного `limit` (docs/06 §6.4). */
export const MAX_SUGGEST_LIMIT = 10;

/**
 * `GET /api/v1/devices/suggest` (docs/06-api-contract.md §6.4). `limit` ограничен клиентом до
 * `MAX_SUGGEST_LIMIT`, потому что сервер сам его не отдаёт больше — присылать значение выше не
 * имеет смысла и вводило бы в заблуждение о реальном числе получаемых подсказок.
 */
export async function suggestDevices(
  baseUrl: string,
  q: string,
  limit: number = MAX_SUGGEST_LIMIT,
  signal?: AbortSignal,
): Promise<SuggestResponse> {
  const boundedLimit = Math.min(limit, MAX_SUGGEST_LIMIT);
  const params = new URLSearchParams({ q, limit: String(boundedLimit) });
  const raw = await requestJson(baseUrl, {
    method: 'GET',
    path: `/api/v1/devices/suggest?${params.toString()}`,
    ...(signal !== undefined ? { signal } : {}),
  });
  const parsed = parseSuggestResponse(raw);
  if (parsed === undefined) {
    throw new ApiParseError('/api/v1/devices/suggest');
  }
  return parsed;
}

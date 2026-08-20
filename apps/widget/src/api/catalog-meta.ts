import { ApiParseError } from './error';
import { requestJson } from './http';
import { isFiniteNumber, isNonEmptyString, isRecord } from './predicates';

/**
 * Форма ответа `GET /api/v1/catalog/meta` (docs/06-api-contract.md §6.4, реализация
 * `apps/api/src/modules/catalog/catalog.snapshot.ts`) — версия и объём загруженного справочника.
 * Добавлено этапом 6.4 для стенда отладки `/debug` (docs/07 §7.6): предыдущие агенты (6.2/6.3)
 * этот эндпоинт не вызывали, поэтому клиента для него ещё не было.
 */
export interface CatalogMeta {
  readonly version: string;
  readonly deviceCount: number;
  readonly updatedAt: string | null;
}

export function parseCatalogMeta(value: unknown): CatalogMeta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { version, deviceCount, updatedAt } = value;
  if (!isNonEmptyString(version) || !isFiniteNumber(deviceCount)) {
    return undefined;
  }
  if (updatedAt !== null && !isNonEmptyString(updatedAt)) {
    return undefined;
  }
  return { version, deviceCount, updatedAt: updatedAt === null ? null : updatedAt };
}

/** `GET /api/v1/catalog/meta` (docs/06-api-contract.md §6.4). `baseUrl` — параметр, не константа (ADR-027). */
export async function getCatalogMeta(baseUrl: string): Promise<CatalogMeta> {
  const raw = await requestJson(baseUrl, { method: 'GET', path: '/api/v1/catalog/meta' });
  const parsed = parseCatalogMeta(raw);
  if (parsed === undefined) {
    throw new ApiParseError('/api/v1/catalog/meta');
  }
  return parsed;
}

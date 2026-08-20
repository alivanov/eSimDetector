import { isArrayOf, isNonEmptyString, isOptionalString, isRecord } from './predicates';

/**
 * Элемент `reasons[]` (docs/06-api-contract.md §6.2/§6.3). Код — открытое множество строк, а не
 * закрытый union: реестр кодов пополняется сервером (ADR-010, ADR-034 — три кода типа устройства
 * добавились в этом же этапе), и закрытый тип клиента ломался бы при каждом добавлении нового
 * кода на сервере, хотя клиенту достаточно уметь показать код/подпись, ему заранее не известные.
 */
export interface ApiReason {
  readonly code: string;
  readonly detail?: string;
}

function isApiReason(value: unknown): value is ApiReason {
  return isRecord(value) && isNonEmptyString(value['code']) && isOptionalString(value['detail']);
}

export function parseReasons(value: unknown): readonly ApiReason[] | undefined {
  if (value === undefined) {
    return [];
  }
  return isArrayOf(value, isApiReason) ? value : undefined;
}

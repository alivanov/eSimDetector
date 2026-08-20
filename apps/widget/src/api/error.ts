import { isNonEmptyString, isOptionalString, isRecord, isString } from './predicates';

/** Конверт ошибки (docs/06-api-contract.md §6.5) — единый для всех эндпоинтов. */
export interface ApiErrorDetail {
  readonly field?: string;
  readonly issue: string;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
  readonly requestId: string;
}

function parseErrorDetail(value: unknown): ApiErrorDetail | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { field, issue } = value;
  if (!isOptionalString(field) || !isNonEmptyString(issue)) {
    return undefined;
  }
  return { ...(field !== undefined ? { field } : {}), issue };
}

function parseErrorDetails(value: unknown): readonly ApiErrorDetail[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: ApiErrorDetail[] = [];
  for (const item of value) {
    const parsed = parseErrorDetail(item);
    if (parsed === undefined) {
      return undefined;
    }
    result.push(parsed);
  }
  return result;
}

/**
 * Разбор конверта `{ error: { code, message, details, requestId } }`. Возвращает `undefined`,
 * если тело ответа не соответствует этой форме — вызывающий код (`./http.ts`) в этом случае
 * подставляет собственное сообщение по HTTP-статусу, а не падает на недоразобранном теле.
 */
export function parseApiErrorBody(value: unknown): ApiErrorBody | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { error } = value;
  if (!isRecord(error)) {
    return undefined;
  }
  const { code, message, details, requestId } = error;
  if (!isString(code) || !isNonEmptyString(message) || !isNonEmptyString(requestId)) {
    return undefined;
  }
  const parsedDetails = parseErrorDetails(details);
  if (details !== undefined && parsedDetails === undefined) {
    return undefined;
  }
  return {
    code,
    message,
    ...(parsedDetails !== undefined ? { details: parsedDetails } : {}),
    requestId,
  };
}

/**
 * Сбой взаимодействия транспортного уровня (docs/06 §6.5, ADR-008) — коды 4xx/5xx. НЕ используется
 * для бизнес-результата `clarification_required`: тот приходит кодом 200 и разбирается как обычный
 * успешный ответ.
 */
export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details: readonly ApiErrorDetail[] | undefined;
  public readonly requestId: string | undefined;

  public constructor(
    code: string,
    message: string,
    httpStatus: number,
    details?: readonly ApiErrorDetail[],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * Ответ не сформирован сервером вовсе — `fetch` отклонён (сеть недоступна, CORS, обрыв), а не
 * ответил кодом (docs/13-branding.md §13.6, «Ошибки взаимодействия», строка «Сеть недоступна»).
 * Отдельный класс от `ApiRequestError` — интерфейс показывает разные тексты для этих двух веток
 * (ограничение объёма агента 6.2: «отдельная ветка „сеть недоступна“»).
 */
export class ApiNetworkError extends Error {
  public constructor(message = 'Не удалось связаться с сервисом') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

/** Тело ответа получено, но не соответствует ни ожидаемой форме результата, ни форме ошибки. */
export class ApiParseError extends Error {
  public constructor(endpoint: string) {
    super(`Не удалось разобрать ответ сервиса: ${endpoint}`);
    this.name = 'ApiParseError';
  }
}

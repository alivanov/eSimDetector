import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * Реестр кодов ошибок — часть контракта API (docs/06-api-contract.md, раздел 6.5)
 * и не меняется без повышения версии API.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ORIGIN'
  | 'DEVICE_NOT_FOUND'
  | 'REQUEST_NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'CATALOG_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  readonly field?: string;
  readonly issue: string;
}

/**
 * Базовое исключение транспортного уровня. Результат определения устройства
 * (`clarification_required` и т. п.) исключением не является (ADR-008) —
 * этот класс предназначен только для сбоев взаимодействия из реестра выше.
 */
export class ApiError extends HttpException {
  public readonly code: ApiErrorCode;
  public readonly details: readonly ApiErrorDetail[] | undefined;

  public constructor(
    code: ApiErrorCode,
    message: string,
    httpStatus: HttpStatus,
    details?: readonly ApiErrorDetail[],
  ) {
    super(message, httpStatus);
    this.code = code;
    this.details = details;
  }
}

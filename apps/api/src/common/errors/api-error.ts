import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * Реестр кодов ошибок — часть контракта API (docs/06-api-contract.md, раздел 6.5)
 * и не меняется без повышения версии API.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'DEVICE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'CATALOG_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  /**
   * Группа `/api/v1/admin/*` (docs/15-moderation.md §15.8, этап 7) — отдельный тег API, не
   * входивший в реестр docs/06 §6.5 на момент его написания. `TASK_NOT_FOUND` симметричен
   * `DEVICE_NOT_FOUND` выше (тот же 404, другая сущность).
   */
  | 'TASK_NOT_FOUND'
  /** Повторный `POST /admin/eval/runs`, пока уже идёт прогон (409). */
  | 'EVAL_RUN_IN_PROGRESS'
  /** Неизвестный идентификатор прогона стенда оценки (404). */
  | 'EVAL_RUN_NOT_FOUND';

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

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiError, type ApiErrorCode, type ApiErrorDetail } from '../errors/api-error';
import { getRequestId } from '../middleware/request-id.middleware';

interface ResolvedError {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details: readonly ApiErrorDetail[] | undefined;
}

const DEFAULT_CODE_BY_STATUS: ReadonlyMap<number, ApiErrorCode> = new Map<number, ApiErrorCode>([
  [HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR'],
  [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
  [HttpStatus.FORBIDDEN, 'FORBIDDEN_ORIGIN'],
  // Без явного ApiError с точным кодом сработавший маршрут неизвестен, поэтому
  // при обычном 404 используется код из реестра, ближе всего описывающий
  // "ресурс не найден" в текущем контракте. Доменные модули должны бросать
  // ApiError('DEVICE_NOT_FOUND' | 'REQUEST_NOT_FOUND', ...) явно.
  [HttpStatus.NOT_FOUND, 'DEVICE_NOT_FOUND'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE'],
  [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'CATALOG_UNAVAILABLE'],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessage(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (isRecord(response)) {
    const { message } = response;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      const issues = message.filter((item): item is string => typeof item === 'string');
      if (issues.length > 0) {
        return issues.join('; ');
      }
    }
  }

  return exception.message;
}

function extractDetails(exception: HttpException): readonly ApiErrorDetail[] | undefined {
  const response = exception.getResponse();
  if (!isRecord(response)) {
    return undefined;
  }

  const { message } = response;
  if (!Array.isArray(message)) {
    return undefined;
  }

  const issues = message
    .filter((item): item is string => typeof item === 'string')
    .map((issue) => ({ issue }));
  return issues.length > 0 ? issues : undefined;
}

function resolveException(exception: unknown): ResolvedError {
  if (exception instanceof ApiError) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code: DEFAULT_CODE_BY_STATUS.get(status) ?? 'INTERNAL_ERROR',
      message: extractMessage(exception),
      details: extractDetails(exception),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Внутренняя ошибка сервиса',
    details: undefined,
  };
}

/**
 * Единый формат ошибок для всех эндпоинтов (docs/06-api-contract.md, раздел 6.5).
 * Результат определения устройства сюда не попадает: `clarification_required`
 * и подобные статусы возвращаются кодом 200 и этим фильтром не перехватываются (ADR-008).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();
    const requestId = getRequestId(request);

    const resolved = resolveException(exception);

    if (resolved.status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`[${requestId}] ${resolved.message}`, stack);
    }

    response.status(resolved.status).json({
      error: {
        code: resolved.code,
        message: resolved.message,
        ...(resolved.details ? { details: resolved.details } : {}),
        requestId,
      },
    });
  }
}

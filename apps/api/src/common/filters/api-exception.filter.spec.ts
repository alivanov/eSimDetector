import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiError } from '../errors/api-error';
import { requestIdMiddleware } from '../middleware/request-id.middleware';
import { ApiExceptionFilter } from './api-exception.filter';

function createHost(request: Request, response: Response): ArgumentsHost {
  const httpArgumentsHost = {
    getRequest: () => request,
    getResponse: () => response,
    getNext: () => undefined,
  };

  return {
    switchToHttp: () => httpArgumentsHost,
    getArgByIndex: () => undefined,
    getArgs: () => [],
    getType: () => 'http',
    switchToRpc: () => {
      throw new Error('не используется');
    },
    switchToWs: () => {
      throw new Error('не используется');
    },
  } as unknown as ArgumentsHost;
}

function createRequestAndResponse(): { request: Request; response: Response; body: () => unknown } {
  let capturedStatus = 0;
  let capturedBody: unknown;

  const request = { headers: {} } as unknown as Request;
  const response = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(payload: unknown) {
      capturedBody = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  } as unknown as Response;

  return {
    request,
    response,
    body: () => ({ status: capturedStatus, ...(isRecord(capturedBody) ? capturedBody : {}) }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('переносит код и сообщение из ApiError без изменений', () => {
    const { request, response, body } = createRequestAndResponse();
    requestIdMiddleware(request, response, () => undefined);

    filter.catch(
      new ApiError('DEVICE_NOT_FOUND', 'Устройство не найдено', HttpStatus.NOT_FOUND),
      createHost(request, response),
    );

    expect(body()).toMatchObject({
      status: HttpStatus.NOT_FOUND,
      error: { code: 'DEVICE_NOT_FOUND', message: 'Устройство не найдено' },
    });
  });

  it('преобразует ошибку валидации Nest в код VALIDATION_ERROR с деталями', () => {
    const { request, response, body } = createRequestAndResponse();
    requestIdMiddleware(request, response, () => undefined);

    filter.catch(
      new BadRequestException(['q должен быть непустым']),
      createHost(request, response),
    );

    const result = body() as { error: { code: string; details: unknown } };
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.details).toEqual([{ issue: 'q должен быть непустым' }]);
  });

  it('заменяет неизвестное исключение на INTERNAL_ERROR с кодом 500', () => {
    const { request, response, body } = createRequestAndResponse();
    requestIdMiddleware(request, response, () => undefined);

    filter.catch(new Error('нечто непредвиденное'), createHost(request, response));

    expect(body()).toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('мапит PayloadTooLargeError Express (status 413) в PAYLOAD_TOO_LARGE, а не в 500', () => {
    const { request, response, body } = createRequestAndResponse();
    requestIdMiddleware(request, response, () => undefined);

    const payloadError = Object.assign(new Error('request entity too large'), {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      type: 'entity.too.large',
    });

    filter.catch(payloadError, createHost(request, response));

    expect(body()).toMatchObject({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' },
    });
  });

  it('мапит HttpException 413 в PAYLOAD_TOO_LARGE', () => {
    const { request, response, body } = createRequestAndResponse();
    requestIdMiddleware(request, response, () => undefined);

    filter.catch(
      new ApiError(
        'PAYLOAD_TOO_LARGE',
        'Тело запроса слишком большое',
        HttpStatus.PAYLOAD_TOO_LARGE,
      ),
      createHost(request, response),
    );

    expect(body()).toMatchObject({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
  });

  it('включает requestId запроса в тело ошибки', () => {
    const { request, response, body } = createRequestAndResponse();
    request.headers['x-request-id'] = 'from-client';
    requestIdMiddleware(request, response, () => undefined);

    filter.catch(new Error('сбой'), createHost(request, response));

    const result = body() as { error: { requestId: string } };
    expect(result.error.requestId).toBe('from-client');
  });
});

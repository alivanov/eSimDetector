import { ApiNetworkError, ApiParseError, ApiRequestError, parseApiErrorBody } from './error';

describe('parseApiErrorBody', () => {
  it('разбирает конверт ошибки (docs/06-api-contract.md §6.5)', () => {
    expect(
      parseApiErrorBody({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Параметр q обязателен',
          details: [{ field: 'q', issue: 'too_short' }],
          requestId: 'r-1',
        },
      }),
    ).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Параметр q обязателен',
      details: [{ field: 'q', issue: 'too_short' }],
      requestId: 'r-1',
    });
  });

  it('без details — details отсутствует в результате', () => {
    const result = parseApiErrorBody({
      error: { code: 'CATALOG_UNAVAILABLE', message: 'm', requestId: 'r-1' },
    });
    expect(result?.details).toBeUndefined();
  });

  it('details неверной формы — undefined целиком', () => {
    expect(
      parseApiErrorBody({
        error: { code: 'X', message: 'm', requestId: 'r', details: [{ issue: 1 }] },
      }),
    ).toBeUndefined();
  });

  it('не соответствует форме конверта — undefined', () => {
    expect(parseApiErrorBody({})).toBeUndefined();
    expect(parseApiErrorBody({ error: 'x' })).toBeUndefined();
    expect(
      parseApiErrorBody({ error: { code: 'X', message: '', requestId: 'r' } }),
    ).toBeUndefined();
    expect(parseApiErrorBody('x')).toBeUndefined();
  });
});

describe('классы ошибок', () => {
  it('ApiRequestError хранит код/статус/детали/requestId', () => {
    const error = new ApiRequestError(
      'RATE_LIMITED',
      'Слишком много запросов',
      429,
      undefined,
      'r-1',
    );
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.httpStatus).toBe(429);
    expect(error.requestId).toBe('r-1');
    expect(error).toBeInstanceOf(Error);
  });

  it('ApiNetworkError — отдельная ветка от ApiRequestError', () => {
    const error = new ApiNetworkError();
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiRequestError);
  });

  it('ApiParseError сообщает об эндпоинте', () => {
    expect(new ApiParseError('/api/v1/detect').message).toContain('/api/v1/detect');
  });
});

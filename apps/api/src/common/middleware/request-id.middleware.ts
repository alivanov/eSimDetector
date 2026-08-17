import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Сопоставление запроса и его идентификатора через WeakMap, а не через
 * расширение типа `Request`: не требует утверждений типа при чтении в фильтре
 * ошибок и не течёт при завершении запроса.
 */
const requestIds = new WeakMap<Request, string>();

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  requestIds.set(req, requestId);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(req: Request): string {
  return requestIds.get(req) ?? 'unknown';
}

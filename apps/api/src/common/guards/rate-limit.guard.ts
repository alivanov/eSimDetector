import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { EnvConfig } from '../../config/env.schema';
import { ApiError } from '../errors/api-error';

interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;

/**
 * Пути, дёргаемые оркестратором/комиссией, а не конечным пользователем виджета — ограничение
 * частоты по ним отключено (health-проверки не должны получать 429 из-за собственной частоты
 * опроса, а статические страницы документации не относятся к бизнес-эндпоинтам docs/06 §6.1).
 */
const EXEMPT_PATH_PREFIXES: readonly string[] = ['/health', '/api/docs'];

function isExemptPath(path: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Ограничение частоты запросов по IP и по ключу API (docs/06-api-contract.md §6.1: «при
 * превышении — `429` с `Retry-After`»; docs/07-integration.md §7.8: `RATE_LIMIT_RPM`).
 * Запрос с валидным `X-Admin-Token` (совпал с непустым `ADMIN_TOKEN`) не учитывается в квоте
 * (ADR-049) — иначе стенд оценки из `/admin` упирался бы в собственный лимит.
 *
 * Реализован как глобальный `CanActivate` (`APP_GUARD` в `app.module.ts`), а не как «сырой»
 * Express-`middleware`: гварды — часть конвейера Nest, поэтому брошенный `ApiError` перехватывается
 * `ApiExceptionFilter` тем же самым механизмом, что уже проверен на `AdminTokenGuard`, а не рискует
 * остаться необработанным исключением Express до попадания в Nest.
 *
 * Фиксированное окно в 60 секунд, счётчики — в памяти процесса: тот же принцип масштабирования,
 * что и у кэша справочника (docs/07 §7.9 — «кэш справочника локален для экземпляра»), достаточный
 * для одного экземпляра демонстрационного контура; распределённый рейт-лимитер — вне объёма.
 * Ключ — `X-Api-Key`, если он присутствует (server-to-server интеграция получает отдельную квоту,
 * не зависящую от того, сколько конечных пользователей стоит за одним NAT), иначе IP-адрес.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  public constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (isExemptPath(request.path)) {
      return true;
    }

    // Стенд оценки и админ-клиент с валидным токеном не должны упираться в RATE_LIMIT_RPM
    // (план «Админка и главная» §1.3): публичные /detect и /search без токена — с лимитом.
    const adminToken = this.configService.get('ADMIN_TOKEN', { infer: true });
    const providedAdminToken = request.headers['x-admin-token'];
    if (
      adminToken.length > 0 &&
      typeof providedAdminToken === 'string' &&
      providedAdminToken === adminToken
    ) {
      return true;
    }

    const limit = this.configService.get('RATE_LIMIT_RPM', { infer: true });
    const key = this.resolveKey(request);
    const now = Date.now();
    const existing = this.buckets.get(key);
    const bucket: Bucket =
      existing !== undefined && now - existing.windowStart < WINDOW_MS
        ? existing
        : { count: 0, windowStart: now };
    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (bucket.count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000),
      );
      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader('Retry-After', String(retryAfterSeconds));
      throw new ApiError(
        'RATE_LIMITED',
        `Превышена частота запросов: не более ${limit} в минуту, повторите через ${retryAfterSeconds} с`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveKey(request: Request): string {
    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      return `key:${apiKeyHeader}`;
    }
    return `ip:${request.ip ?? 'unknown'}`;
  }
}

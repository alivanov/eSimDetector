import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.schema';

import { RateLimitGuard } from './rate-limit.guard';

function buildContext(
  path: string,
  headers: Record<string, string> = {},
): {
  context: ExecutionContext;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();
  const request = { path, ip: '203.0.113.10', headers };
  const response = { setHeader };
  const httpArgumentsHost = {
    getRequest: () => request,
    getResponse: () => response,
    getNext: () => undefined,
  };
  const context = { switchToHttp: () => httpArgumentsHost } as unknown as ExecutionContext;
  return { context, setHeader };
}

function buildConfigService(rateLimitRpm: number, adminToken = ''): ConfigService<EnvConfig, true> {
  return {
    get: (key: keyof EnvConfig) => {
      if (key === 'RATE_LIMIT_RPM') {
        return rateLimitRpm;
      }
      if (key === 'ADMIN_TOKEN') {
        return adminToken;
      }
      return undefined;
    },
  } as unknown as ConfigService<EnvConfig, true>;
}

/**
 * `RateLimitGuard` (docs/06-api-contract.md §6.1, docs/07-integration.md §7.8: `RATE_LIMIT_RPM`,
 * объявлена конфигурацией с этапа 5, но не была подключена ни к одному эндпоинту) — окно
 * фиксировано на 60 секунд, счётчики — в памяти процесса, по ключу `X-Api-Key` либо IP.
 * Валидный `X-Admin-Token` обходит лимит (план «Админка и главная» §1.3).
 */
describe('RateLimitGuard', () => {
  it('пропускает запросы, пока их число не превышает лимит за минуту', () => {
    const guard = new RateLimitGuard(buildConfigService(3));
    const { context } = buildContext('/api/v1/detect');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('превышение лимита бросает ApiError RATE_LIMITED (429) и выставляет Retry-After', () => {
    const guard = new RateLimitGuard(buildConfigService(2));
    const { context, setHeader } = buildContext('/api/v1/detect');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    let caught: unknown;
    try {
      guard.canActivate(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe('RATE_LIMITED');
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('разные ключи (IP/X-Api-Key) получают отдельные квоты', () => {
    const guard = new RateLimitGuard(buildConfigService(1));
    const withoutKey = buildContext('/api/v1/detect');
    const withKey = buildContext('/api/v1/detect', { 'x-api-key': 'partner-1' });

    expect(guard.canActivate(withoutKey.context)).toBe(true);
    expect(guard.canActivate(withKey.context)).toBe(true);
    expect(() => guard.canActivate(withoutKey.context)).toThrow('Превышена частота запросов');
    expect(() => guard.canActivate(withKey.context)).toThrow('Превышена частота запросов');
  });

  it('не ограничивает частоту health-проверок и страниц документации', () => {
    const guard = new RateLimitGuard(buildConfigService(1));
    const { context } = buildContext('/health/ready');

    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('пропускает запрос с валидным X-Admin-Token без учёта RATE_LIMIT_RPM', () => {
    const guard = new RateLimitGuard(buildConfigService(1, 'secret-admin'));
    const { context } = buildContext('/api/v1/detect', { 'x-admin-token': 'secret-admin' });

    for (let i = 0; i < 20; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('неверный X-Admin-Token не обходит лимит', () => {
    const guard = new RateLimitGuard(buildConfigService(1, 'secret-admin'));
    const { context } = buildContext('/api/v1/detect', { 'x-admin-token': 'wrong' });

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow('Превышена частота запросов');
  });

  it('пустой ADMIN_TOKEN на сервере не даёт обхода даже при совпадающем заголовке', () => {
    const guard = new RateLimitGuard(buildConfigService(1, ''));
    const { context } = buildContext('/api/v1/detect', { 'x-admin-token': '' });

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow('Превышена частота запросов');
  });
});

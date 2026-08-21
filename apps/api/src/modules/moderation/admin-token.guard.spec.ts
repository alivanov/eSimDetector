import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { validateEnv, type EnvConfig } from '../../config/env.schema';

import { AdminTokenGuard } from './admin-token.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  const request: Pick<Request, 'headers'> = { headers };
  const context: Pick<ExecutionContext, 'switchToHttp'> = {
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
      getResponse: () => {
        throw new Error('не используется');
      },
      getNext: () => {
        throw new Error('не используется');
      },
    }),
  };
  return context as ExecutionContext;
}

function buildGuard(adminToken: string): AdminTokenGuard {
  const env: EnvConfig = validateEnv({ NODE_ENV: 'test', ADMIN_TOKEN: adminToken });
  return new AdminTokenGuard(new ConfigService<EnvConfig, true>(env));
}

/**
 * `AdminTokenGuard` (docs/15-moderation.md §15.7—§15.8, ADR-025 п.5: «строго по ADMIN_TOKEN,
 * без исключений») — три ветки: верный токен, неверный токен, пустой `ADMIN_TOKEN` на сервере
 * (раздел закрыт целиком независимо от присланного значения).
 */
describe('AdminTokenGuard', () => {
  it('пропускает запрос с верным токеном', () => {
    const guard = buildGuard('secret-token');
    expect(guard.canActivate(buildContext({ 'x-admin-token': 'secret-token' }))).toBe(true);
  });

  it('отклоняет запрос с неверным токеном', () => {
    const guard = buildGuard('secret-token');
    expect(() => guard.canActivate(buildContext({ 'x-admin-token': 'wrong' }))).toThrow();
  });

  it('отклоняет запрос без заголовка X-Admin-Token', () => {
    const guard = buildGuard('secret-token');
    expect(() => guard.canActivate(buildContext({}))).toThrow();
  });

  it('отклоняет ЛЮБОЙ запрос, если ADMIN_TOKEN на сервере пуст — раздел закрыт целиком (ADR-025 п.5)', () => {
    const guard = buildGuard('');
    expect(() => guard.canActivate(buildContext({ 'x-admin-token': '' }))).toThrow();
    expect(() => guard.canActivate(buildContext({}))).toThrow();
  });
});

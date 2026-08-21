import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { ApiError } from '../../common/errors/api-error';
import type { EnvConfig } from '../../config/env.schema';

const ADMIN_TOKEN_HEADER = 'x-admin-token';

/**
 * Защита раздела `/admin` и группы `/api/v1/admin/*` (docs/15-moderation.md §15.7—§15.8;
 * ADR-025 п.5: «строго по `ADMIN_TOKEN`, без исключений»). Пустой токен в конфигурации закрывает
 * доступ ПОЛНОСТЬЮ — сравнение с пустой присланной строкой не проходит намеренно (иначе
 * забытая настройка `ADMIN_TOKEN` в проде превратила бы «закрыто по умолчанию» в «открыто
 * любому запросу без заголовка»).
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  public constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  public canActivate(context: ExecutionContext): boolean {
    const configuredToken = this.configService.get('ADMIN_TOKEN', { infer: true });
    const request = context.switchToHttp().getRequest<Request>();
    const providedToken = request.headers[ADMIN_TOKEN_HEADER];
    const providedTokenValue = typeof providedToken === 'string' ? providedToken : undefined;

    if (
      configuredToken.length === 0 ||
      providedTokenValue === undefined ||
      providedTokenValue !== configuredToken
    ) {
      throw new ApiError(
        'UNAUTHORIZED',
        'Раздел модерации недоступен: неверный или отсутствующий X-Admin-Token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}

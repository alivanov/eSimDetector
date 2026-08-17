import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';

interface ReadinessBody {
  readonly status: 'ok' | 'degraded';
  readonly dependencies: {
    readonly mongodb: 'connected' | 'disconnected';
  };
}

/**
 * Health-эндпоинты — операционные проверки для оркестратора, а не результат
 * определения устройства. Формат ответа поэтому не подчиняется единому
 * формату ошибок из docs/06-api-contract.md, раздел 6.5: сюда не приходят
 * бизнес-исключения, `/health/ready` просто отражает состояние зависимостей.
 */
@Controller('health')
export class HealthController {
  public constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  public live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  public ready(@Res() res: Response): void {
    const isConnected = this.connection.readyState === ConnectionStates.connected;
    const body: ReadinessBody = {
      status: isConnected ? 'ok' : 'degraded',
      dependencies: {
        mongodb: isConnected ? 'connected' : 'disconnected',
      },
    };

    res.status(isConnected ? 200 : 503).json(body);
  }
}

import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';

import { healthLiveSchema, healthReadySchema } from '../../common/swagger/response-schemas';

import { CatalogService } from '../catalog/catalog.service';

interface ReadinessBody {
  readonly status: 'ok' | 'degraded';
  readonly dependencies: {
    readonly mongodb: 'connected' | 'disconnected';
    readonly catalog: 'ready' | 'loading' | 'error';
  };
}

/**
 * Health-эндпоинты — операционные проверки для оркестратора, а не результат
 * определения устройства. Формат ответа поэтому не подчиняется единому
 * формату ошибок из docs/06-api-contract.md, раздел 6.5: сюда не приходят
 * бизнес-исключения, `/health/ready` просто отражает состояние зависимостей.
 *
 * Признак загруженности справочника (агент 3, критерий готовности): `/health/ready` отдаёт
 * `degraded` и 503, если MongoDB не подключена ИЛИ справочник ещё не прогрет/не загрузился
 * (ADR-005: «прогрев учтён в проверке готовности `/health/ready`»).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly catalogService: CatalogService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness-проверка процесса' })
  @ApiResponse({ status: 200, description: 'Процесс жив', schema: healthLiveSchema })
  public live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: MongoDB и прогретый справочник' })
  @ApiResponse({ status: 200, description: 'Готов обслуживать запросы', schema: healthReadySchema })
  @ApiResponse({
    status: 503,
    description: 'Зависимости не готовы (degraded)',
    schema: healthReadySchema,
  })
  public ready(@Res() res: Response): void {
    const isMongoConnected = this.connection.readyState === ConnectionStates.connected;
    const isCatalogReady = this.catalogService.isReady();
    const isReady = isMongoConnected && isCatalogReady;

    const body: ReadinessBody = {
      status: isReady ? 'ok' : 'degraded',
      dependencies: {
        mongodb: isMongoConnected ? 'connected' : 'disconnected',
        catalog: this.catalogService.getStatus(),
      },
    };

    res.status(isReady ? 200 : 503).json(body);
  }
}

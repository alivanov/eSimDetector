import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { apiErrorSchema, catalogMetaSchema } from '../../common/swagger/response-schemas';

import { CatalogService } from './catalog.service';
import type { CatalogMeta } from './catalog.snapshot';

/**
 * `GET /api/v1/catalog/meta` (docs/06-api-contract.md, §6.4) — версия справочника, число
 * записей и дата обновления. Отвечает 200 и на пустом справочнике (см. критерии готовности
 * агента 3); при незагруженном/сбойном справочнике `CatalogService.getMeta()` бросает
 * `ApiError('CATALOG_UNAVAILABLE', ...)`, перехватываемый `ApiExceptionFilter` — здесь
 * никакой обработки ошибки не требуется (контроллеры без бизнес-логики, api-boundaries.mdc).
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  public constructor(private readonly catalogService: CatalogService) {}

  @Get('meta')
  @ApiOperation({ summary: 'Метаданные справочника (версия, число записей)' })
  @ApiResponse({ status: 200, description: 'Метаданные справочника', schema: catalogMetaSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public getMeta(): CatalogMeta {
    return this.catalogService.getMeta();
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { apiErrorSchema, brandsResponseSchema } from '../../common/swagger/response-schemas';

import { DeviceCatalogQueryService, type BrandSummary } from './device-catalog-query.service';

/** `GET /api/v1/brands` (docs/06-api-contract.md §6.4) — перечень брендов для первого шага ручного выбора. */
@ApiTags('devices')
@Controller('brands')
export class BrandsController {
  public constructor(private readonly deviceCatalogQueryService: DeviceCatalogQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Перечень брендов для ручного выбора' })
  @ApiResponse({ status: 200, description: 'Список брендов', schema: brandsResponseSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public list(): readonly BrandSummary[] {
    return this.deviceCatalogQueryService.listBrands();
  }
}

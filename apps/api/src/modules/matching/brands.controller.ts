import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DeviceCatalogQueryService, type BrandSummary } from './device-catalog-query.service';

/** `GET /api/v1/brands` (docs/06-api-contract.md §6.4) — перечень брендов для первого шага ручного выбора. */
@ApiTags('devices')
@Controller('brands')
export class BrandsController {
  public constructor(private readonly deviceCatalogQueryService: DeviceCatalogQueryService) {}

  @Get()
  public list(): readonly BrandSummary[] {
    return this.deviceCatalogQueryService.listBrands();
  }
}

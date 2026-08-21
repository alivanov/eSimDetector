import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { DeviceCard } from '../../common/response';
import { getRequestId } from '../../common/middleware/request-id.middleware';

import { DeviceCatalogQueryService, type ListDevicesResult } from './device-catalog-query.service';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';
import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';
import { MatchingService } from './matching.service';
import type { SearchResponse, SuggestResponse } from './search-response';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Контроллеры без бизнес-логики (.cursor/rules/api-boundaries.mdc): разбор запроса (DTO,
 * `class-validator`), вызов сервисов, сборка ответа с `requestId`.
 * `GET /api/v1/devices/search` — контракт docs/06-api-contract.md §6.3. `POST` на том же пути —
 * добавленный этим агентом алиас для клиентов, которым удобнее передавать кириллический текст
 * запроса в теле, а не в query-строке; поведение идентично (docs/06 помечен как «черновик»,
 * дополнение задокументировано там же).
 *
 * `GET /devices/{id}` и `GET /devices` (§6.4, этап 8 — реализация оставшейся дорожки API) —
 * зарегистрированы ПОСЛЕ литеральных `search`/`suggest`: Express сопоставляет маршруты в порядке
 * регистрации, поэтому `/devices/search` не перехватывается параметром `:id`.
 */
@ApiTags('devices')
@Controller('devices')
export class MatchingController {
  public constructor(
    private readonly matchingService: MatchingService,
    private readonly deviceCatalogQueryService: DeviceCatalogQueryService,
  ) {}

  @Get('search')
  public searchByQuery(@Query() query: SearchQueryDto, @Req() req: Request): SearchResponse {
    return { requestId: getRequestId(req), ...this.matchingService.search(query.q, query.region) };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  public searchByBody(@Body() body: SearchQueryDto, @Req() req: Request): SearchResponse {
    return { requestId: getRequestId(req), ...this.matchingService.search(body.q, body.region) };
  }

  @Get('suggest')
  public suggest(@Query() query: SuggestQueryDto, @Req() req: Request): SuggestResponse {
    return { requestId: getRequestId(req), ...this.matchingService.suggest(query.q, query.limit) };
  }

  @Get()
  public list(@Query() query: ListDevicesQueryDto): ListDevicesResult {
    return this.deviceCatalogQueryService.list({
      ...(query.brand !== undefined ? { brand: query.brand } : {}),
      ...(query.platform !== undefined ? { platform: query.platform } : {}),
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  @Get(':id')
  public getById(@Param('id') id: string): DeviceCard {
    return this.deviceCatalogQueryService.getByIdOrThrow(id);
  }
}

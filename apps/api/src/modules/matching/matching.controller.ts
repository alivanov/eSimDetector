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
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { DeviceCard } from '../../common/response';
import { getRequestId } from '../../common/middleware/request-id.middleware';
import {
  apiErrorSchema,
  deviceCardSchema,
  listDevicesResponseSchema,
  searchResponseSchema,
  suggestResponseSchema,
} from '../../common/swagger/response-schemas';

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
  @ApiOperation({ summary: 'Определение поддержки eSIM по названию устройства (query)' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Строка поиска, 1–100 символов',
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  })
  @ApiQuery({
    name: 'region',
    required: false,
    description: 'Явный ответ пользователя на адресный вопрос уточнения (не из locale/IP)',
    schema: { type: 'string', maxLength: 10 },
  })
  @ApiResponse({
    status: 200,
    description: 'Результат поиска (включая clarification_required)',
    schema: searchResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', schema: apiErrorSchema })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED', schema: apiErrorSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public searchByQuery(@Query() query: SearchQueryDto, @Req() req: Request): SearchResponse {
    return { requestId: getRequestId(req), ...this.matchingService.search(query.q, query.region) };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Определение поддержки eSIM по названию устройства (тело)',
    description: 'Алиас GET с тем же контрактом (ADR-024 п.6)',
  })
  @ApiResponse({
    status: 200,
    description: 'Результат поиска (включая clarification_required)',
    schema: searchResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', schema: apiErrorSchema })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED', schema: apiErrorSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public searchByBody(@Body() body: SearchQueryDto, @Req() req: Request): SearchResponse {
    return { requestId: getRequestId(req), ...this.matchingService.search(body.q, body.region) };
  }

  @Get('suggest')
  @ApiOperation({ summary: 'Подсказки при вводе названия устройства' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Префикс/фрагмент названия, 1–100 символов',
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Число подсказок, 1–10 (по умолчанию 10)',
    schema: { type: 'integer', minimum: 1, maximum: 10, default: 10 },
  })
  @ApiResponse({ status: 200, description: 'Список подсказок', schema: suggestResponseSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', schema: apiErrorSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public suggest(@Query() query: SuggestQueryDto, @Req() req: Request): SuggestResponse {
    return { requestId: getRequestId(req), ...this.matchingService.suggest(query.q, query.limit) };
  }

  @Get()
  @ApiOperation({ summary: 'Постраничный перечень устройств каталога' })
  @ApiQuery({
    name: 'brand',
    required: false,
    description: 'Слаг бренда (значение из GET /brands)',
    schema: { type: 'string', maxLength: 100 },
  })
  @ApiQuery({
    name: 'platform',
    required: false,
    schema: { type: 'string', enum: ['ios', 'android', 'harmonyos', 'other'] },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({
    status: 200,
    description: 'Страница активных устройств',
    schema: listDevicesResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', schema: apiErrorSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public list(@Query() query: ListDevicesQueryDto): ListDevicesResult {
    return this.deviceCatalogQueryService.list({
      ...(query.brand !== undefined ? { brand: query.brand } : {}),
      ...(query.platform !== undefined ? { platform: query.platform } : {}),
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Полная карточка устройства из справочника' })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор устройства (slug)',
    schema: { type: 'string' },
  })
  @ApiResponse({ status: 200, description: 'Карточка устройства', schema: deviceCardSchema })
  @ApiResponse({ status: 404, description: 'DEVICE_NOT_FOUND', schema: apiErrorSchema })
  @ApiResponse({ status: 503, description: 'CATALOG_UNAVAILABLE', schema: apiErrorSchema })
  public getById(@Param('id') id: string): DeviceCard {
    return this.deviceCatalogQueryService.getByIdOrThrow(id);
  }
}

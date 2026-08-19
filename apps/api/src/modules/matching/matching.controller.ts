import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestId } from '../../common/middleware/request-id.middleware';

import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';
import { MatchingService } from './matching.service';
import type { SearchResponse, SuggestResponse } from './search-response';

/**
 * Контроллеры без бизнес-логики (.cursor/rules/api-boundaries.mdc): разбор запроса (DTO,
 * `class-validator`), вызов `MatchingService`, сборка ответа с `requestId`.
 * `GET /api/v1/devices/search` — контракт docs/06-api-contract.md §6.3. `POST` на том же пути —
 * добавленный этим агентом алиас для клиентов, которым удобнее передавать кириллический текст
 * запроса в теле, а не в query-строке; поведение идентично (docs/06 помечен как «черновик»,
 * дополнение задокументировано там же).
 */
@Controller('devices')
export class MatchingController {
  public constructor(private readonly matchingService: MatchingService) {}

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
}

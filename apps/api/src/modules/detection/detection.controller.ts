import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestId } from '../../common/middleware/request-id.middleware';

import { DetectRequestDto } from './dto/detect-request.dto';
import type { DetectResponse } from './detect-response';
import type { RequestHeaderSignals } from './detection-signals';
import { DetectionService } from './detection.service';

/**
 * `POST /api/v1/detect` (docs/06-api-contract.md, §6.2). Контроллер без бизнес-логики
 * (.cursor/rules/api-boundaries.mdc): разбор запроса и заголовков, вызов `DetectionService`,
 * сборка ответа с `requestId`. Результат — всегда 200 (ADR-008), включая `clarification_required`.
 */

function extractHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  // `Array.isArray` сужает тип до `any[]` (теряет `readonly string[]`), поэтому проверка через
  // `typeof` — единственный способ получить строку без утверждения типа (ADR-016: `as` запрещён).
  const raw = typeof value === 'string' ? value : value?.[0];
  if (raw === undefined) {
    return undefined;
  }
  // Значения Sec-CH-UA-* приходят в кавычках (`"Android"`) — снимаем их для сравнения.
  return raw.replace(/^"|"$/g, '');
}

function extractHeaders(req: Request): RequestHeaderSignals {
  const model = extractHeaderValue(req.headers['sec-ch-ua-model']);
  const platform = extractHeaderValue(req.headers['sec-ch-ua-platform']);
  return {
    ...(model !== undefined ? { model } : {}),
    ...(platform !== undefined ? { platform } : {}),
  };
}

@Controller('detect')
export class DetectionController {
  public constructor(private readonly detectionService: DetectionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  public detect(@Body() body: DetectRequestDto, @Req() req: Request): DetectResponse {
    const requestId = getRequestId(req);
    const result = this.detectionService.detect(
      body.signals,
      extractHeaders(req),
      requestId,
      body.context?.region,
    );
    return { requestId, ...result };
  }
}

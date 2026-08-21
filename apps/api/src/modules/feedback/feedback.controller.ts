import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModerationTaskService } from '../moderation/moderation-task.service';

import { FeedbackRequestDto } from './dto/feedback-request.dto';

export interface FeedbackResponse {
  readonly requestId: string;
  readonly received: true;
}

/**
 * `POST /api/v1/feedback` (docs/06-api-contract.md §6.4, docs/15-moderation.md §15.2,
 * задача `user_feedback`) — публичный эндпоинт, без токена администратора: любой клиент может
 * сообщить о неверном результате. Всегда отвечает 200/201 «принято» (ADR-008: приём обращения —
 * не результат определения устройства, но тот же принцип «не смешивать бизнес-исход с
 * транспортной ошибкой» применён и здесь) — само обращение попадает в очередь модерации, а не
 * получает мгновенную оценку правоты пользователя.
 */
@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  public constructor(private readonly taskService: ModerationTaskService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  public async submit(@Body() body: FeedbackRequestDto): Promise<FeedbackResponse> {
    await this.taskService.recordUserFeedback({
      requestId: body.requestId,
      reportedStatus: body.reportedStatus,
      deviceId: body.deviceId ?? null,
      comment: body.comment,
      signalsSummary: body.signalsSummary ?? null,
    });
    return { requestId: body.requestId, received: true };
  }
}

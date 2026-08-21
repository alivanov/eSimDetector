import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /api/v1/feedback` (docs/06-api-contract.md §6.4, docs/15-moderation.md §15.2:
 * задача `user_feedback` — «Ответ сервиса, сигналы, комментарий пользователя»). Публичный
 * эндпоинт (не под `/admin`) — клиент сообщает о неверном результате, минимально повторяя то,
 * что уже видел на экране: `requestId`/`status`/`deviceId` из ответа `/detect`, которые клиент
 * получил ранее, плюс собственный комментарий. Сырые сигналы не обязательны и не проверяются
 * структурно (стенд `/debug` уже показал их как есть, docs/07 §7.6) — здесь это просто текстовая
 * заметка для модератора, а не повторная валидация сигналов устройства.
 */
export class FeedbackRequestDto {
  @IsString()
  @MaxLength(200)
  public requestId!: string;

  @IsIn(['supported', 'not_supported', 'clarification_required'])
  public reportedStatus!: 'supported' | 'not_supported' | 'clarification_required';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  public deviceId?: string;

  @IsString()
  @MaxLength(2000)
  public comment!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  public signalsSummary?: string;
}

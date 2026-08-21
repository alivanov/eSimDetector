import { Module } from '@nestjs/common';

import { ModerationModule } from '../moderation/moderation.module';

import { FeedbackController } from './feedback.controller';

/** `POST /api/v1/feedback` (docs/06-api-contract.md §6.4) — записывает обращение в очередь модерации. */
@Module({
  imports: [ModerationModule],
  controllers: [FeedbackController],
})
export class FeedbackModule {}

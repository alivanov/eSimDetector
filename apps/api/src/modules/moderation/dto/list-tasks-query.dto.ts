import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import type { ModerationTaskKind, ModerationTaskStatus } from '@esim-detector/contracts';

const MODERATION_TASK_KINDS: readonly ModerationTaskKind[] = [
  'unknown_model_code',
  'unknown_screen_signature',
  'unmatched_query',
  'ambiguous_query',
  'csv_quarantine',
  'source_disagreement',
  'user_feedback',
];

const MODERATION_TASK_STATUSES: readonly ModerationTaskStatus[] = ['open', 'resolved', 'rejected'];

/** `GET /api/v1/admin/moderation/tasks` (docs/15-moderation.md §15.8) — фильтры и постраничная выдача. */
export class ListTasksQueryDto {
  @IsOptional()
  @IsIn(MODERATION_TASK_KINDS)
  public kind?: ModerationTaskKind;

  @IsOptional()
  @IsIn(MODERATION_TASK_STATUSES)
  public status?: ModerationTaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize?: number;
}

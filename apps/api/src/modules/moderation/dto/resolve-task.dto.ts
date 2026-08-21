import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /api/v1/admin/moderation/tasks/{id}/resolve` (docs/15-moderation.md §15.4, §15.8).
 * Действие модератора в один клик — состав обязательных полей зависит от `action` и от `kind`
 * задачи (проверяется в `ModerationResolutionService`, а не декораторами: комбинации «действие ×
 * тип задачи» — бизнес-правило, а не структурная валидация формы, .cursor/rules/api-boundaries.mdc:
 * «контроллеры без бизнес-логики», но не «сервисы без валидации»).
 */
export type ResolveTaskAction =
  | 'link_model_code'
  | 'link_screen_signature'
  | 'confirm_quarantine'
  | 'reject_quarantine'
  | 'resolve_source_disagreement'
  | 'acknowledge_feedback'
  | 'reject';

const RESOLVE_TASK_ACTIONS: readonly ResolveTaskAction[] = [
  'link_model_code',
  'link_screen_signature',
  'confirm_quarantine',
  'reject_quarantine',
  'resolve_source_disagreement',
  'acknowledge_feedback',
  'reject',
];

export class ResolveModerationTaskDto {
  @IsIn(RESOLVE_TASK_ACTIONS)
  public action!: ResolveTaskAction;

  @IsString()
  @MaxLength(200)
  public decidedBy!: string;

  /** Ссылка на источник — обязательна для статуса `verified` (ADR-014, docs/15 §15.4). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  public deviceId?: string;

  @IsOptional()
  @IsIn(['supported', 'not_supported', 'conditional'])
  public esimSupport?: 'supported' | 'not_supported' | 'conditional';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  public sourceTitle?: string;

  /** Причина отклонения (docs/15 §15.4: «закрытие без изменений с указанием причины»). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public note?: string;
}

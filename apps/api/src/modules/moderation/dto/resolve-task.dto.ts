import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /api/v1/admin/moderation/tasks/{id}/resolve` (docs/15-moderation.md §15.4, §15.8).
 * Действие модератора в один клик — состав обязательных полей зависит от `action` и от `kind`
 * задачи (проверяется в `ModerationResolutionService`, а не декораторами: комбинации «действие ×
 * тип задачи» — бизнес-правило, а не структурная валидация формы, .cursor/rules/api-boundaries.mdc:
 * «контроллеры без бизнес-логики», но не «сервисы без валидации»).
 *
 * `@IsNotEmpty` у каждого содержательного поля обязателен, а не косметичен: схемы
 * `@esim-detector/contracts`, которыми документы читаются обратно, требуют непустых строк
 * (`z.string().min(1)`), поэтому пустая строка, пропущенная границей, создаёт документ, который
 * невозможно прочитать (docs/09-decisions.md ADR-044).
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
  @IsNotEmpty()
  @MaxLength(200)
  public decidedBy!: string;

  /** Обоснование решения для журнала (docs/15 §15.6). Ссылка на источник — отдельное поле `sourceUrl`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public reason?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public deviceId?: string;

  @IsOptional()
  @IsIn(['supported', 'not_supported', 'conditional'])
  public esimSupport?: 'supported' | 'not_supported' | 'conditional';

  /** Ссылка на источник — обязательна для уровня `verified` (docs/15 §15.4, ADR-026 п.1). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public sourceUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  public sourceTitle?: string;

  /** Причина отклонения (docs/15 §15.4: «закрытие без изменений с указанием причины»). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public note?: string;
}

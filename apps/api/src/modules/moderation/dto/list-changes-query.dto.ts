import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `GET /api/v1/admin/changes` (docs/15-moderation.md §15.6, §15.8) — журнал изменений, только чтение. */
export class ListChangesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public deviceId?: string;

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

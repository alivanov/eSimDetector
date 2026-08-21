import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import type { Platform } from '@esim-detector/contracts';

const PLATFORMS: readonly Platform[] = ['ios', 'android', 'harmonyos', 'other'];

/** `GET /api/v1/devices?brand=&platform=&page=` (docs/06-api-contract.md §6.4) — постраничный перечень. */
export class ListDevicesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public brand?: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  public platform?: Platform;

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

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { DeviceSourceDto } from './create-device.dto';

/**
 * `PATCH /api/v1/admin/devices/{id}` (docs/15-moderation.md §15.8) — «пишется в слой overrides»
 * буквально: поля этого DTO — прямое отражение `CatalogOverridePatch`
 * (`@esim-detector/contracts`), а не произвольная форма редактирования устройства.
 */
export class EsimPatchDto {
  @IsOptional()
  @IsIn(['supported', 'not_supported', 'conditional'])
  public support?: 'supported' | 'not_supported' | 'conditional';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public notes?: string;
}

export class UpdateDeviceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EsimPatchDto)
  public esim?: EsimPatchDto;

  @IsOptional()
  @IsIn(['verified', 'derived', 'unverified', 'quarantined'])
  public dataConfidence?: 'verified' | 'derived' | 'unverified' | 'quarantined';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceSourceDto)
  public sources?: DeviceSourceDto[];

  @IsOptional()
  @IsIn(['active', 'deprecated'])
  public status?: 'active' | 'deprecated';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMaxSize(20)
  public modelCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMaxSize(20)
  public aliases?: string[];

  @IsOptional()
  @IsIn(['phone', 'tablet', 'watch', 'laptop', 'other'])
  public deviceType?: 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public decidedBy!: string;

  /**
   * Обоснование решения для журнала (docs/15 §15.6). Пустая строка недопустима: она проходила бы
   * границу, но не проходила бы `catalogOverrideSchema` при чтении документа обратно
   * (docs/09-decisions.md ADR-044).
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public reason!: string;
}

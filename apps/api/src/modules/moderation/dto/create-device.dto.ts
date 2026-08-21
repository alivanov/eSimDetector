import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * `POST /api/v1/admin/devices` (docs/15-moderation.md §15.4, §15.8) — «Создать запись
 * устройства», минимальная форма для технического специалиста без знания кода (ADR-025 п.6):
 * не повторяет весь `Device` (docs/05 §5.3) буквально — часть полей (`displayName`, `popularity`,
 * `provenance`, `createdAt`/`updatedAt`) вычисляется `CatalogWriteService.createDevice`, а не
 * вводится вручную.
 */
export class DeviceSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  public title!: string;
}

export class CreateDeviceDto {
  /** Идентификатор вида `xiaomi-poco-x7-pro` — латиница в нижнем регистре и дефисы. */
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MaxLength(100)
  public id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public brandTitle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public marketingName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public family!: string;

  @IsOptional()
  @IsInt()
  public generation?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMaxSize(10)
  public modifiers?: string[];

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

  @IsIn(['ios', 'android', 'harmonyos', 'other'])
  public platform!: 'ios' | 'android' | 'harmonyos' | 'other';

  @IsIn(['phone', 'tablet', 'watch', 'laptop', 'other'])
  public deviceType!: 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';

  @IsIn(['supported', 'not_supported', 'conditional'])
  public esimSupport!: 'supported' | 'not_supported' | 'conditional';

  @IsInt()
  @Min(2007)
  @Max(2100)
  public releaseYear!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceSourceDto)
  public sources?: DeviceSourceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public notes?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public decidedBy!: string;

  /** Обоснование решения для журнала `catalog_changes` (docs/15 §15.6); источник — в `sources`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public reason!: string;

  /** Если запись создаётся по мотивам задачи очереди — она закрывается автоматически. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public resolvesTaskId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public popularity?: number;
}

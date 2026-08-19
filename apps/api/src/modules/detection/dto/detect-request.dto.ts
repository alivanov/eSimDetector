import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTO `POST /api/v1/detect` (docs/06-api-contract.md, §6.2). Все поля `signals` необязательны
 * (.cursor/rules/api-boundaries.mdc: «сервис обязан работать с любым их подмножеством») —
 * валидация проверяет ТИП присланного значения, а не его обязательность. Структурно совпадает
 * с `../detection-signals.ts` (без декораторов) — алгоритм принимает эти классы напрямую
 * благодаря структурной типизации TypeScript.
 */
export class UaBrandDto {
  @IsString()
  public brand!: string;

  @IsString()
  public version!: string;
}

export class UaDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public platform?: string;

  @IsOptional()
  @IsBoolean()
  public mobile?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  public model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  public platformVersion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UaBrandDto)
  public brands?: UaBrandDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UaBrandDto)
  public fullVersionList?: UaBrandDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  public architecture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  public bitness?: string;
}

export class ScreenDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  public width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  public height?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  public availWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  public availHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  public dpr?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  public orientation?: string;
}

export class HardwareDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  public maxTouchPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(256)
  public hardwareConcurrency?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1024)
  public deviceMemory?: number;
}

export class WebglDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  public renderer?: string;
}

export class SignalsDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  public userAgent?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UaDataDto)
  public uaData?: UaDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScreenDto)
  public screen?: ScreenDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => HardwareDto)
  public hardware?: HardwareDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WebglDto)
  public webgl?: WebglDto;
}

export class RequestContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  public locale?: string;

  /**
   * Регион — ТОЛЬКО явный ответ пользователя на адресный вопрос уточнения (docs/06 §6.2,
   * ADR-007). Валидация здесь проверяет только тип и длину присланной строки (ADR-016); значения
   * (`"CN"`, `"OTHER"` и т. п.) заданы `esim.clarifyingQuestion.options` конкретной записи
   * справочника, а не фиксированным перечнем на границе API — набор регионов различается между
   * записями (docs/05 §5.4).
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  public region?: string;
}

export class DetectRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SignalsDto)
  public signals?: SignalsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequestContextDto)
  public context?: RequestContextDto;
}

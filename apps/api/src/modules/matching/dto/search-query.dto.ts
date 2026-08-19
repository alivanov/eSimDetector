import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, MaxLength, Max, Min } from 'class-validator';

/**
 * DTO запроса `GET/POST /api/v1/devices/search` (docs/06-api-contract.md, §6.3). Валидация на
 * границе `class-validator` (ADR-016, docs/02-architecture.md §2.6) — тип предметной области
 * (строка запроса) появляется только после проверки длины, без утверждений `as`.
 */
export class SearchQueryDto {
  @IsString()
  @Length(1, 100, { message: 'Параметр q обязателен и должен содержать от 1 до 100 символов' })
  public q!: string;

  /**
   * Регион — ТОЛЬКО явный ответ пользователя на адресный вопрос уточнения (docs/06 §6.2/§6.3,
   * ADR-007), симметрично `context.region` эндпоинта `/detect`. Общий класс `SearchQueryDto`
   * используется и для `GET` (query-строка), и для `POST` (тело) — оба принимают поле одинаково
   * (docs/09 ADR-024 п.6: `POST` — аддитивный алиас `GET` с тем же контрактом).
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  public region?: string;
}

const DEFAULT_SUGGEST_LIMIT = 10;
const MAX_SUGGEST_LIMIT = 10;

export class SuggestQueryDto {
  @IsString()
  @Length(1, 100, { message: 'Параметр q обязателен и должен содержать от 1 до 100 символов' })
  public q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SUGGEST_LIMIT)
  public limit: number = DEFAULT_SUGGEST_LIMIT;
}

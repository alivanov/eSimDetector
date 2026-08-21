import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST /api/v1/admin/aliases` (docs/15-moderation.md §15.8) — «Пополнение словаря, применяется без перезапуска». */
export class AddAliasDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public alias!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public decidedBy!: string;
}

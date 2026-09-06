import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateScriptDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

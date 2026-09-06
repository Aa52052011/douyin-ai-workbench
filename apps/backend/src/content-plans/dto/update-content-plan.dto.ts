import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateContentPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

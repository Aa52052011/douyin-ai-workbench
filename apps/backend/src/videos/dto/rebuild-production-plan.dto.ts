import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

class RebuildPreferencesDto {
  @IsOptional()
  @IsBoolean()
  preferRealFootage?: boolean;

  @IsOptional()
  @IsBoolean()
  preferDigitalHuman?: boolean;

  @IsOptional()
  @IsBoolean()
  preferLowCost?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAiVideo?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAiImage?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDigitalHuman?: boolean;
}

export class RebuildProductionPlanDto {
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RebuildPreferencesDto)
  preferences?: RebuildPreferencesDto;
}

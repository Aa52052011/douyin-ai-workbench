import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class ProductionPreferencesDto {
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

  @IsOptional()
  @IsBoolean()
  lockPreferredAssets?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredVoiceId?: string;

  @IsOptional()
  @IsUUID()
  preferredDigitalHumanProfileId?: string;
}

export class CreateVideoDto {
  @IsUUID()
  scriptId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  visualStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  resolution?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetDuration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductionPreferencesDto)
  preferences?: ProductionPreferencesDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  preferredAssetIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('all', { each: true })
  referenceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  excludedAssetIds?: string[];
}

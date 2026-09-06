import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IMPORT_METRICS_PROVIDERS } from '../import-metrics.constants.js';
import { PG_INT_MAX } from '../publication-metrics.constants.js';

export class ImportPublicationMetricsValuesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  views?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  likes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  comments?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  shares?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  favorites?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(999_999_999.999)
  averageWatchTimeSeconds?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  completionRate?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PG_INT_MAX)
  newFollowers?: number | null;
}

export class CreateImportPublicationMetricsDto {
  @IsISO8601()
  observedAt!: string;

  @IsOptional()
  @IsISO8601()
  providerCollectedAt?: string | null;

  @IsString()
  @MaxLength(64)
  @IsIn([...IMPORT_METRICS_PROVIDERS])
  provider!: string;

  @ValidateNested()
  @Type(() => ImportPublicationMetricsValuesDto)
  @IsObject()
  metrics!: ImportPublicationMetricsValuesDto;

  @IsOptional()
  @IsObject()
  providerMetadata?: Record<string, unknown>;
}

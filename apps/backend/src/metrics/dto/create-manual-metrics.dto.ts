import { IsInt, IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PG_INT_MAX } from '../publication-metrics.constants.js';

export class CreateManualPublicationMetricsDto {
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

  @IsOptional()
  @IsISO8601()
  observedAt?: string;
}

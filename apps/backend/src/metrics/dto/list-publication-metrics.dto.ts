import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MANUAL_METRICS_MAX_LIMIT } from '../publication-metrics.constants.js';

export class ListPublicationMetricsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MANUAL_METRICS_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContentPlanDto {
  @IsUUID()
  projectId!: string;

  @Type(() => Number)
  @IsInt()
  planningDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  postsPerDay!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  platform!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contentStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalRequirements?: string;

  @IsOptional()
  @IsObject()
  positioning?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  positioningRunId?: string;

  @IsOptional()
  @IsUUID()
  strategyId?: string;

  @IsOptional()
  @IsBoolean()
  ignoreAcceptedPerformanceFeedback?: boolean;
}

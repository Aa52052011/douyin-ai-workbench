import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ComposeCampaignStrategyInputDto {
  @IsOptional()
  @IsUUID()
  productBriefId?: string;

  @IsOptional()
  @IsUUID()
  marketResearchId?: string;

  @IsOptional()
  @IsUUID()
  marketInsightId?: string;

  @IsUUID()
  positioningRunId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  focus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  constraints?: string;
}

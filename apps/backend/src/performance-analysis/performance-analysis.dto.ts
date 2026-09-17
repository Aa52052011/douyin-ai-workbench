import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class AnalyzePublishedPostDto {
  @IsOptional()
  @IsIn(['LATEST_ONLY', 'FIRST_24H', 'FIRST_48H', 'FIRST_7D', 'CUSTOM'])
  analysisWindow?: 'LATEST_ONLY' | 'FIRST_24H' | 'FIRST_48H' | 'FIRST_7D' | 'CUSTOM';

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ReviewRecommendationDto {
  @IsString()
  @IsIn(['APPROVE', 'REJECT', 'DEFER'])
  action!: 'APPROVE' | 'REJECT' | 'DEFER';

  @IsOptional()
  @IsString()
  userNote?: string;
}

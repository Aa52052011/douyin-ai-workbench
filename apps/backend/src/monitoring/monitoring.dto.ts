import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RecordManualExportDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  artifactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  destinationType?: 'DOWNLOAD' | 'USER_CHOSEN';
}

export class RegisterPublishedPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  artifactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  platformUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platformPostId?: string;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string;

  @IsOptional()
  @IsUUID()
  videoId?: string;

  @IsOptional()
  @IsUUID()
  scriptId?: string;

  @IsOptional()
  @IsUUID()
  contentPlanId?: string;
}

export class CreateMonitoringMetricsDto {
  @IsOptional()
  playCount?: number | null;

  @IsOptional()
  likeCount?: number | null;

  @IsOptional()
  commentCount?: number | null;

  @IsOptional()
  shareCount?: number | null;

  @IsOptional()
  collectCount?: number | null;

  @IsOptional()
  followerDelta?: number | null;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

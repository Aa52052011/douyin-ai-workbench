import { AssetType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class InitAssetDto {
  @IsUUID()
  projectId!: string;

  @IsEnum(AssetType)
  type!: AssetType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  originalFilename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32 * 1024 * 1024)
  size?: number;
}

import { Platform, PublicationMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreatePublicationDto {
  @ValidateIf((dto: CreatePublicationDto) => dto.mode === PublicationMode.API || dto.platformAccountId != null)
  @IsUUID()
  platformAccountId?: string;

  @IsEnum(Platform)
  platform!: Platform;

  @IsEnum(PublicationMode)
  mode!: PublicationMode;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Type(() => String)
  hashtags?: string[];

  @IsIn(['PUBLIC', 'PRIVATE', 'FRIENDS'])
  visibility!: 'PUBLIC' | 'PRIVATE' | 'FRIENDS';
}

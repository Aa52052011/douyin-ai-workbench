import { VideoStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListVideosQueryDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  scriptId?: string;

  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;
}

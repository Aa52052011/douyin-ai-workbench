import { Platform } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListPlatformAccountsQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;
}

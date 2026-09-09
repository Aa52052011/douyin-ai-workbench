import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeIncomingProjectPlatform,
  PROJECT_PLATFORM_API_ALLOWED,
} from '../project-platform.js';

export class UpdateProjectDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeIncomingProjectPlatform(value))
  @IsIn([...PROJECT_PLATFORM_API_ALLOWED])
  platform?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  description?: string;
}

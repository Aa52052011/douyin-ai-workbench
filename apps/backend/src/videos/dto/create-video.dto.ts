import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVideoDto {
  @IsUUID()
  scriptId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  visualStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  resolution?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetDuration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateScriptDto {
  @IsUUID()
  contentPlanId!: string;

  @IsUUID()
  topicId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetDuration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;
}

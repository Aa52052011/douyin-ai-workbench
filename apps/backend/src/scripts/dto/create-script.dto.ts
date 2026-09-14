import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

  /** Explicit ReferenceContent ids only (max 3). Never auto-selected. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('all', { each: true })
  referenceIds?: string[];
}

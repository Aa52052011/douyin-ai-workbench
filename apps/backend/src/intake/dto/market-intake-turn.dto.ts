import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class MarketIntakeTurnMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class MarketIntakeTurnDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  clientTurnId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  userMessage!: string;

  @IsObject()
  draft!: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => MarketIntakeTurnMessageDto)
  messages!: MarketIntakeTurnMessageDto[];

  @IsOptional()
  @IsBoolean()
  improvingExisting?: boolean;

  /** Frontend may echo acknowledgement for deterministic readiness; AI cannot set it. */
  @IsOptional()
  @IsBoolean()
  userAcknowledgedLimitedData?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;
}

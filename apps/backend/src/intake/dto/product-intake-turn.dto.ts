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

class ProductIntakeTurnMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class ProductIntakeTurnDto {
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
  @Type(() => ProductIntakeTurnMessageDto)
  messages!: ProductIntakeTurnMessageDto[];

  @IsOptional()
  @IsBoolean()
  improvingExisting?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;
}

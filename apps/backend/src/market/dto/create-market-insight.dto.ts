import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMarketInsightDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userFocus?: string;
}

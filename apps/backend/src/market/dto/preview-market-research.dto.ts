import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsObject, IsOptional, IsUUID } from 'class-validator';
import { MARKET_MAX_ITEMS } from '../market.constants.js';

export class PreviewMarketResearchDto {
  @IsOptional()
  @IsUUID()
  productBriefId?: string;

  @IsISO8601()
  collectedAt!: string;

  @IsOptional()
  @IsObject()
  timeWindow?: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(MARKET_MAX_ITEMS)
  @IsObject({ each: true })
  @Type(() => Object)
  items!: Record<string, unknown>[];
}

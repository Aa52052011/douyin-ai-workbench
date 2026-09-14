import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';
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

  /** Step 13.4 — structured intake sources (provenance SoT). Optional / additive. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MARKET_MAX_ITEMS)
  @IsObject({ each: true })
  @Type(() => Object)
  intakeSources?: Record<string, unknown>[];

  @IsOptional()
  @IsBoolean()
  researchRequested?: boolean;
}

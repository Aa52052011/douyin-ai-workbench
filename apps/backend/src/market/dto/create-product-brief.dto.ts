import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PRODUCT_BRIEF_LIMITS } from '../market.constants.js';

export class CreateProductBriefDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_BRIEF_LIMITS.productName)
  productName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.category)
  category?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_BRIEF_LIMITS.industry)
  industry!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.brand)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.description)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_BRIEF_LIMITS.sellingPoints)
  @IsString({ each: true })
  @MaxLength(PRODUCT_BRIEF_LIMITS.sellingPoint, { each: true })
  sellingPoints?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.targetAudience)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.priceRange)
  priceRange?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_BRIEF_LIMITS.businessGoal)
  businessGoal!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  goalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.conversionGoal)
  conversionGoal?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_BRIEF_LIMITS.constraints)
  @IsString({ each: true })
  @MaxLength(PRODUCT_BRIEF_LIMITS.constraint, { each: true })
  constraints?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_BRIEF_LIMITS.tone)
  tone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_BRIEF_LIMITS.referenceCompetitors)
  @IsString({ each: true })
  @MaxLength(PRODUCT_BRIEF_LIMITS.competitor, { each: true })
  referenceCompetitors?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_BRIEF_LIMITS.seedKeywords)
  @IsString({ each: true })
  @MaxLength(PRODUCT_BRIEF_LIMITS.seedKeyword, { each: true })
  seedKeywords?: string[];
}

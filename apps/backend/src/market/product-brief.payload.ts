import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { PRODUCT_BRIEF_LIMITS } from './market.constants.js';
import type { ProductBriefPayload } from './market.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} exceeds ${max} characters`);
  }
  return trimmed;
}

function optionalString(record: Record<string, unknown>, key: string, max: number): string | undefined {
  if (!(key in record) || record[key] == null) {
    return undefined;
  }
  if (typeof record[key] !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} must be a string`);
  }
  const trimmed = record[key].trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > max) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} exceeds ${max} characters`);
  }
  return trimmed;
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
  maxItems: number,
  maxItemLength: number,
): string[] | undefined {
  if (!(key in record) || record[key] == null) {
    return undefined;
  }
  if (!Array.isArray(record[key])) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} must be an array`);
  }
  if (record[key].length > maxItems) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} exceeds ${maxItems} items`);
  }
  const next = record[key]
    .map((item) => {
      if (typeof item !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} items must be strings`);
      }
      return item.trim();
    })
    .filter(Boolean);
  if (next.some((item) => item.length > maxItemLength)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${key} item exceeds ${maxItemLength} characters`);
  }
  return next.length > 0 ? next : undefined;
}

export function parseProductBriefPayload(input: unknown): ProductBriefPayload {
  if (!isRecord(input)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Product brief payload is invalid');
  }
  const payload: ProductBriefPayload = {
    productName: requiredString(input, 'productName', PRODUCT_BRIEF_LIMITS.productName),
    industry: requiredString(input, 'industry', PRODUCT_BRIEF_LIMITS.industry),
    businessGoal: requiredString(input, 'businessGoal', PRODUCT_BRIEF_LIMITS.businessGoal),
  };
  const category = optionalString(input, 'category', PRODUCT_BRIEF_LIMITS.category);
  const brand = optionalString(input, 'brand', PRODUCT_BRIEF_LIMITS.brand);
  const description = optionalString(input, 'description', PRODUCT_BRIEF_LIMITS.description);
  const targetAudience = optionalString(input, 'targetAudience', PRODUCT_BRIEF_LIMITS.targetAudience);
  const priceRange = optionalString(input, 'priceRange', PRODUCT_BRIEF_LIMITS.priceRange);
  const conversionGoal = optionalString(input, 'conversionGoal', PRODUCT_BRIEF_LIMITS.conversionGoal);
  const tone = optionalString(input, 'tone', PRODUCT_BRIEF_LIMITS.tone);
  const sellingPoints = optionalStringArray(
    input,
    'sellingPoints',
    PRODUCT_BRIEF_LIMITS.sellingPoints,
    PRODUCT_BRIEF_LIMITS.sellingPoint,
  );
  const constraints = optionalStringArray(
    input,
    'constraints',
    PRODUCT_BRIEF_LIMITS.constraints,
    PRODUCT_BRIEF_LIMITS.constraint,
  );
  const referenceCompetitors = optionalStringArray(
    input,
    'referenceCompetitors',
    PRODUCT_BRIEF_LIMITS.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.competitor,
  );
  const seedKeywords = optionalStringArray(
    input,
    'seedKeywords',
    PRODUCT_BRIEF_LIMITS.seedKeywords,
    PRODUCT_BRIEF_LIMITS.seedKeyword,
  );
  if (category) {
    payload.category = category;
  }
  if (brand) {
    payload.brand = brand;
  }
  if (description) {
    payload.description = description;
  }
  if (targetAudience) {
    payload.targetAudience = targetAudience;
  }
  if (priceRange) {
    payload.priceRange = priceRange;
  }
  if (conversionGoal) {
    payload.conversionGoal = conversionGoal;
  }
  if (tone) {
    payload.tone = tone;
  }
  if (sellingPoints) {
    payload.sellingPoints = sellingPoints;
  }
  if (constraints) {
    payload.constraints = constraints;
  }
  if (referenceCompetitors) {
    payload.referenceCompetitors = referenceCompetitors;
  }
  if (seedKeywords) {
    payload.seedKeywords = seedKeywords;
  }
  JSON.stringify(payload);
  return payload;
}

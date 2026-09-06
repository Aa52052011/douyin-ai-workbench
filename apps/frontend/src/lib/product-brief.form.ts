import {
  PRODUCT_BRIEF_FIELD_LABELS,
  PRODUCT_BRIEF_LIMITS,
  type ProductBriefPayload,
} from "./product-brief.types";

export type ProductBriefFormState = {
  productName: string;
  brand: string;
  industry: string;
  category: string;
  description: string;
  businessGoal: string;
  conversionGoal: string;
  priceRange: string;
  sellingPoints: string[];
  targetAudience: string;
  seedKeywords: string[];
  referenceCompetitors: string[];
  tone: string;
  constraints: string[];
};

export type ProductBriefFieldErrors = Partial<Record<keyof ProductBriefFormState, string>>;

export function emptyProductBriefForm(defaults?: Partial<Pick<ProductBriefFormState, "industry" | "description">>): ProductBriefFormState {
  return {
    productName: "",
    brand: "",
    industry: defaults?.industry ?? "",
    category: "",
    description: defaults?.description ?? "",
    businessGoal: "",
    conversionGoal: "",
    priceRange: "",
    sellingPoints: [],
    targetAudience: "",
    seedKeywords: [],
    referenceCompetitors: [],
    tone: "",
    constraints: [],
  };
}

export function formFromPayload(payload: ProductBriefPayload): ProductBriefFormState {
  return {
    productName: payload.productName ?? "",
    brand: payload.brand ?? "",
    industry: payload.industry ?? "",
    category: payload.category ?? "",
    description: payload.description ?? "",
    businessGoal: payload.businessGoal ?? "",
    conversionGoal: payload.conversionGoal ?? "",
    priceRange: payload.priceRange ?? "",
    sellingPoints: [...(payload.sellingPoints ?? [])],
    targetAudience: payload.targetAudience ?? "",
    seedKeywords: [...(payload.seedKeywords ?? [])],
    referenceCompetitors: [...(payload.referenceCompetitors ?? [])],
    tone: payload.tone ?? "",
    constraints: [...(payload.constraints ?? [])],
  };
}

export function normalizeListItems(items: string[], maxItems: number, maxItemLength: number): string[] {
  const next: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > maxItemLength) {
      continue;
    }
    if (!next.includes(trimmed)) {
      next.push(trimmed);
    }
    if (next.length >= maxItems) {
      break;
    }
  }
  return next;
}

function optionalText(value: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    return undefined;
  }
  return trimmed;
}

export function payloadFromForm(form: ProductBriefFormState): ProductBriefPayload {
  const payload: ProductBriefPayload = {
    productName: form.productName.trim(),
    industry: form.industry.trim(),
    businessGoal: form.businessGoal.trim(),
  };
  const category = optionalText(form.category, PRODUCT_BRIEF_LIMITS.category);
  const brand = optionalText(form.brand, PRODUCT_BRIEF_LIMITS.brand);
  const description = optionalText(form.description, PRODUCT_BRIEF_LIMITS.description);
  const targetAudience = optionalText(form.targetAudience, PRODUCT_BRIEF_LIMITS.targetAudience);
  const priceRange = optionalText(form.priceRange, PRODUCT_BRIEF_LIMITS.priceRange);
  const conversionGoal = optionalText(form.conversionGoal, PRODUCT_BRIEF_LIMITS.conversionGoal);
  const tone = optionalText(form.tone, PRODUCT_BRIEF_LIMITS.tone);
  const sellingPoints = normalizeListItems(form.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoint);
  const constraints = normalizeListItems(form.constraints, PRODUCT_BRIEF_LIMITS.constraints, PRODUCT_BRIEF_LIMITS.constraint);
  const referenceCompetitors = normalizeListItems(
    form.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.competitor,
  );
  const seedKeywords = normalizeListItems(form.seedKeywords, PRODUCT_BRIEF_LIMITS.seedKeywords, PRODUCT_BRIEF_LIMITS.seedKeyword);
  if (category) payload.category = category;
  if (brand) payload.brand = brand;
  if (description) payload.description = description;
  if (targetAudience) payload.targetAudience = targetAudience;
  if (priceRange) payload.priceRange = priceRange;
  if (conversionGoal) payload.conversionGoal = conversionGoal;
  if (tone) payload.tone = tone;
  if (sellingPoints.length) payload.sellingPoints = sellingPoints;
  if (constraints.length) payload.constraints = constraints;
  if (referenceCompetitors.length) payload.referenceCompetitors = referenceCompetitors;
  if (seedKeywords.length) payload.seedKeywords = seedKeywords;
  return payload;
}

function requiredError(value: string, label: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return `请填写${label}`;
  }
  if (trimmed.length > max) {
    return `${label}不能超过 ${max} 个字`;
  }
  return undefined;
}

function optionalError(value: string, label: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return `${label}不能超过 ${max} 个字`;
  }
  return undefined;
}

function listError(items: string[], label: string, maxItems: number, maxItemLength: number): string | undefined {
  if (items.length > maxItems) {
    return `${label}最多 ${maxItems} 项`;
  }
  if (items.some((item) => item.trim().length > maxItemLength)) {
    return `${label}单项不能超过 ${maxItemLength} 个字`;
  }
  return undefined;
}

export function validateProductBriefForm(form: ProductBriefFormState): ProductBriefFieldErrors {
  const errors: ProductBriefFieldErrors = {};
  const productName = requiredError(form.productName, PRODUCT_BRIEF_FIELD_LABELS.productName, PRODUCT_BRIEF_LIMITS.productName);
  const industry = requiredError(form.industry, PRODUCT_BRIEF_FIELD_LABELS.industry, PRODUCT_BRIEF_LIMITS.industry);
  const businessGoal = requiredError(form.businessGoal, PRODUCT_BRIEF_FIELD_LABELS.businessGoal, PRODUCT_BRIEF_LIMITS.businessGoal);
  const brand = optionalError(form.brand, PRODUCT_BRIEF_FIELD_LABELS.brand, PRODUCT_BRIEF_LIMITS.brand);
  const category = optionalError(form.category, PRODUCT_BRIEF_FIELD_LABELS.category, PRODUCT_BRIEF_LIMITS.category);
  const description = optionalError(form.description, PRODUCT_BRIEF_FIELD_LABELS.description, PRODUCT_BRIEF_LIMITS.description);
  const conversionGoal = optionalError(form.conversionGoal, PRODUCT_BRIEF_FIELD_LABELS.conversionGoal, PRODUCT_BRIEF_LIMITS.conversionGoal);
  const priceRange = optionalError(form.priceRange, PRODUCT_BRIEF_FIELD_LABELS.priceRange, PRODUCT_BRIEF_LIMITS.priceRange);
  const targetAudience = optionalError(form.targetAudience, PRODUCT_BRIEF_FIELD_LABELS.targetAudience, PRODUCT_BRIEF_LIMITS.targetAudience);
  const tone = optionalError(form.tone, PRODUCT_BRIEF_FIELD_LABELS.tone, PRODUCT_BRIEF_LIMITS.tone);
  const sellingPoints = listError(
    form.sellingPoints,
    PRODUCT_BRIEF_FIELD_LABELS.sellingPoints,
    PRODUCT_BRIEF_LIMITS.sellingPoints,
    PRODUCT_BRIEF_LIMITS.sellingPoint,
  );
  const seedKeywords = listError(
    form.seedKeywords,
    PRODUCT_BRIEF_FIELD_LABELS.seedKeywords,
    PRODUCT_BRIEF_LIMITS.seedKeywords,
    PRODUCT_BRIEF_LIMITS.seedKeyword,
  );
  const referenceCompetitors = listError(
    form.referenceCompetitors,
    PRODUCT_BRIEF_FIELD_LABELS.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.competitor,
  );
  const constraints = listError(
    form.constraints,
    PRODUCT_BRIEF_FIELD_LABELS.constraints,
    PRODUCT_BRIEF_LIMITS.constraints,
    PRODUCT_BRIEF_LIMITS.constraint,
  );
  if (productName) errors.productName = productName;
  if (industry) errors.industry = industry;
  if (businessGoal) errors.businessGoal = businessGoal;
  if (brand) errors.brand = brand;
  if (category) errors.category = category;
  if (description) errors.description = description;
  if (conversionGoal) errors.conversionGoal = conversionGoal;
  if (priceRange) errors.priceRange = priceRange;
  if (targetAudience) errors.targetAudience = targetAudience;
  if (tone) errors.tone = tone;
  if (sellingPoints) errors.sellingPoints = sellingPoints;
  if (seedKeywords) errors.seedKeywords = seedKeywords;
  if (referenceCompetitors) errors.referenceCompetitors = referenceCompetitors;
  if (constraints) errors.constraints = constraints;
  return errors;
}

export function isMissingCurrent(brief: unknown): boolean {
  return brief == null;
}

export function sortBriefsByVersionDesc<T extends { version: number }>(briefs: T[]): T[] {
  return [...briefs].sort((a, b) => b.version - a.version);
}

export function historyBriefs<T extends { id: string; version: number }>(briefs: T[], current: T | null): T[] {
  const sorted = sortBriefsByVersionDesc(briefs);
  if (!current) {
    return sorted;
  }
  return sorted.filter((item) => item.id !== current.id);
}

const FIELD_ERROR_KEYS = Object.keys(PRODUCT_BRIEF_FIELD_LABELS);

export function humanizeProductBriefSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const matched = FIELD_ERROR_KEYS.find((key) => message.startsWith(`${key} `) || message.startsWith(`${key} is`));
  if (matched) {
    const label = PRODUCT_BRIEF_FIELD_LABELS[matched as keyof typeof PRODUCT_BRIEF_FIELD_LABELS];
    if (message.includes("required")) {
      return `请填写${label}`;
    }
    if (message.includes("exceeds")) {
      return `${label}超出限制，请缩短后再试`;
    }
  }
  return "保存失败，请检查填写内容后重试。";
}

export function positioningHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/positioning`;
}

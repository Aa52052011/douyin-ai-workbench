import {
  PRODUCT_INTAKE_REQUIRED_FOR_CONFIRM,
  type ProductIntakeDraft,
  type ProductIntakeFieldKey,
} from './product-intake.types.js';

/** Guided confirm scalars (not formal ProductBrief API contract). */
export const PRODUCT_INTAKE_GUIDED_REQUIRED_FIELDS = PRODUCT_INTAKE_REQUIRED_FOR_CONFIRM;

export const PRODUCT_INTAKE_FIELD_LABELS: Record<string, string> = {
  productName: '产品名称',
  industry: '所属行业',
  businessGoal: '业务目标',
  targetAudience: '目标用户',
  description: '产品介绍/卖点',
  productDescription: '产品介绍/卖点',
};

export const PRODUCT_OPTIONAL_LATER_FIELDS: readonly ProductIntakeFieldKey[] = [
  'category',
  'brand',
  'priceRange',
  'conversionGoal',
  'tone',
  'constraints',
  'referenceCompetitors',
  'seedKeywords',
  'painPoints',
  'differentiation',
  'usageScenario',
] as const;

export type ProductIntakeQuestionPlan = {
  missingRequiredFields: ProductIntakeFieldKey[];
  missingRequiredLabels: string[];
  nextPriorityFields: ProductIntakeFieldKey[];
  optionalLaterFields: ProductIntakeFieldKey[];
  readyForConfirmation: boolean;
  improvingExisting: boolean;
};

function hasText(value: unknown): boolean {
  return typeof value === 'string' && Boolean(value.trim());
}

function hasList(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim());
}

/** Deterministic guided missing fields. description stands for description OR sellingPoints. */
export function deriveProductIntakeMissingRequired(draft: ProductIntakeDraft): ProductIntakeFieldKey[] {
  const missing: ProductIntakeFieldKey[] = [];
  for (const key of PRODUCT_INTAKE_GUIDED_REQUIRED_FIELDS) {
    if (!hasText(draft[key])) {
      missing.push(key);
    }
  }
  if (!hasText(draft.description) && !hasList(draft.sellingPoints)) {
    missing.push('description');
  }
  return missing;
}

export function getProductIntakeQuestionPlan(
  draft: ProductIntakeDraft,
  options?: { improvingExisting?: boolean },
): ProductIntakeQuestionPlan {
  const improvingExisting = Boolean(options?.improvingExisting);
  const missingRequiredFields = deriveProductIntakeMissingRequired(draft);
  const missingRequiredLabels = missingRequiredFields.map(
    (key) => PRODUCT_INTAKE_FIELD_LABELS[key] ?? key,
  );

  if (improvingExisting && missingRequiredFields.length === 0) {
    const optionalLaterFields = PRODUCT_OPTIONAL_LATER_FIELDS.filter((key) => {
      const value = draft[key];
      if (typeof value === 'string') {
        return !value.trim();
      }
      if (Array.isArray(value)) {
        return !value.some((item) => typeof item === 'string' && item.trim());
      }
      return true;
    });
    return {
      missingRequiredFields: [],
      missingRequiredLabels: [],
      nextPriorityFields: [],
      optionalLaterFields: optionalLaterFields.slice(0, 4),
      readyForConfirmation: true,
      improvingExisting: true,
    };
  }

  const nextPriorityFields = missingRequiredFields.slice(0, 2);
  return {
    missingRequiredFields,
    missingRequiredLabels,
    nextPriorityFields,
    optionalLaterFields: [...PRODUCT_OPTIONAL_LATER_FIELDS],
    readyForConfirmation: missingRequiredFields.length === 0,
    improvingExisting,
  };
}

/** Compact draft for prompt — drop empty keys to save tokens. */
export function compactProductIntakeDraft(draft: ProductIntakeDraft): ProductIntakeDraft {
  const out: ProductIntakeDraft = {};
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === 'string' && value.trim()) {
      (out as Record<string, string>)[key] = value.trim();
    } else if (Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim())) {
      (out as Record<string, string[]>)[key] = value.filter(
        (item) => typeof item === 'string' && item.trim(),
      ) as string[];
    }
  }
  return out;
}

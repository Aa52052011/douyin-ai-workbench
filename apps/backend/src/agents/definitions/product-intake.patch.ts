import { AgentError } from '../agent.errors.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { isUnknownUserReply, filterUnknownStrings } from './intake-unknown.js';
import { deriveProductIntakeMissingRequired } from './product-intake-question-plan.js';
import {
  PRODUCT_INTAKE_ALLOWED_FIELDS,
  PRODUCT_INTAKE_ARRAY_FIELDS,
  PRODUCT_INTAKE_LIMITS,
  PRODUCT_INTAKE_SCALAR_FIELDS,
  type ProductIntakeAgentOutput,
  type ProductIntakeDraft,
  type ProductIntakeFieldKey,
  type ProductIntakeSuggestion,
} from './product-intake.types.js';

const ALLOWED = new Set<string>(PRODUCT_INTAKE_ALLOWED_FIELDS);
const SCALARS = new Set<string>(PRODUCT_INTAKE_SCALAR_FIELDS);
const ARRAYS = new Set<string>(PRODUCT_INTAKE_ARRAY_FIELDS);

const SCALAR_LIMIT: Record<string, number> = {
  productName: PRODUCT_INTAKE_LIMITS.productName,
  industry: PRODUCT_INTAKE_LIMITS.industry,
  businessGoal: PRODUCT_INTAKE_LIMITS.businessGoal,
  targetAudience: PRODUCT_INTAKE_LIMITS.targetAudience,
  description: PRODUCT_INTAKE_LIMITS.description,
  category: PRODUCT_INTAKE_LIMITS.category,
  brand: PRODUCT_INTAKE_LIMITS.brand,
  priceRange: PRODUCT_INTAKE_LIMITS.priceRange,
  conversionGoal: PRODUCT_INTAKE_LIMITS.conversionGoal,
  tone: PRODUCT_INTAKE_LIMITS.tone,
  differentiation: PRODUCT_INTAKE_LIMITS.differentiation,
  usageScenario: PRODUCT_INTAKE_LIMITS.usageScenario,
};

const ARRAY_ITEM_LIMIT: Record<string, number> = {
  sellingPoints: PRODUCT_INTAKE_LIMITS.sellingPoint,
  constraints: PRODUCT_INTAKE_LIMITS.constraint,
  referenceCompetitors: PRODUCT_INTAKE_LIMITS.competitor,
  seedKeywords: PRODUCT_INTAKE_LIMITS.seedKeyword,
  painPoints: PRODUCT_INTAKE_LIMITS.painPoint,
};

const ARRAY_MAX: Record<string, number> = {
  sellingPoints: PRODUCT_INTAKE_LIMITS.sellingPoints,
  constraints: PRODUCT_INTAKE_LIMITS.constraints,
  referenceCompetitors: PRODUCT_INTAKE_LIMITS.referenceCompetitors,
  seedKeywords: PRODUCT_INTAKE_LIMITS.seedKeywords,
  painPoints: PRODUCT_INTAKE_LIMITS.painPoints,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeList(items: string[], maxItems: number, maxItemLength: number): string[] {
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

function coerceStringList(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (isRecord(item)) {
      const candidate = item.value ?? item.text ?? item.label;
      if (typeof candidate === 'string') {
        out.push(candidate);
      }
    }
  }
  return out;
}

/** Server-side allowlist sanitizer for LLM draftPatch. Never Object.assign raw. */
export function sanitizeProductIntakeDraftPatch(raw: unknown): ProductIntakeDraft {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  // Reject prototype-pollution keys even when not enumerable via Object.entries.
  for (const key of Object.getOwnPropertyNames(raw)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
  const patch: ProductIntakeDraft = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (!ALLOWED.has(key)) {
      // Unknown keys rejected (strict)
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (value === undefined || value === null) {
      continue;
    }
    if (SCALARS.has(key)) {
      if (typeof value !== 'string') {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      const trimmed = value.trim();
      if (!trimmed || isUnknownUserReply(trimmed)) {
        continue;
      }
      const max = SCALAR_LIMIT[key] ?? 200;
      if (trimmed.length > max) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      (patch as Record<string, string>)[key] = trimmed;
      continue;
    }
    if (ARRAYS.has(key)) {
      const coerced = coerceStringList(value);
      if (coerced === null) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      const list = normalizeList(
        filterUnknownStrings(coerced),
        ARRAY_MAX[key] ?? 12,
        ARRAY_ITEM_LIMIT[key] ?? 200,
      );
      if (list.length) {
        (patch as Record<string, string[]>)[key] = list;
      }
    }
  }
  return patch;
}

/**
 * Merge semantics:
 * - scalar set: overwrite with non-empty patch value (supports correction)
 * - scalar empty in patch: does not clear existing
 * - array set: replace with sanitized list when provided (supports correction of list fields)
 */
export function mergeProductIntakeDraft(
  current: ProductIntakeDraft,
  patch: ProductIntakeDraft,
): ProductIntakeDraft {
  const next: ProductIntakeDraft = { ...current };
  for (const key of PRODUCT_INTAKE_SCALAR_FIELDS) {
    const value = patch[key];
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    }
  }
  for (const key of PRODUCT_INTAKE_ARRAY_FIELDS) {
    const value = patch[key];
    if (Array.isArray(value)) {
      next[key] = [...value];
    }
  }
  return next;
}

export function getProductIntakeReadiness(draft: ProductIntakeDraft): {
  missingFields: ProductIntakeFieldKey[];
  readyForConfirmation: boolean;
} {
  const missingFields = deriveProductIntakeMissingRequired(draft);
  return {
    missingFields,
    readyForConfirmation: missingFields.length === 0,
  };
}

export function sanitizeProductIntakeSuggestions(raw: unknown): ProductIntakeSuggestion[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const out: ProductIntakeSuggestion[] = [];
  for (const item of raw.slice(0, PRODUCT_INTAKE_LIMITS.suggestions)) {
    if (!isRecord(item)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const field = item.field;
    if (typeof field !== 'string' || !ALLOWED.has(field)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `sug-${out.length + 1}`;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 120) : undefined;
    let value: string | string[];
    if (ARRAYS.has(field)) {
      const coerced = coerceStringList(item.value);
      if (coerced === null) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
      value = normalizeList(coerced, ARRAY_MAX[field] ?? 12, ARRAY_ITEM_LIMIT[field] ?? 200);
      if (!value.length) {
        continue;
      }
    } else {
      if (typeof item.value !== 'string' || !item.value.trim()) {
        continue;
      }
      value = item.value.trim().slice(0, SCALAR_LIMIT[field] ?? 200);
    }
    out.push({ id, field: field as ProductIntakeFieldKey, value, ...(label ? { label } : {}) });
  }
  return out;
}

export function applyDeterministicReadiness(
  output: Omit<ProductIntakeAgentOutput, 'missingFields' | 'readyForConfirmation'> & {
    draftAfterMerge: ProductIntakeDraft;
  },
): ProductIntakeAgentOutput {
  const readiness = getProductIntakeReadiness(output.draftAfterMerge);
  return {
    message: output.message,
    draftPatch: output.draftPatch,
    suggestions: output.suggestions,
    missingFields: readiness.missingFields,
    readyForConfirmation: readiness.readyForConfirmation,
  };
}

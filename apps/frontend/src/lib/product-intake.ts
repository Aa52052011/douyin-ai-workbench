import { normalizeListItems } from "./product-brief.form";
import {
  PRODUCT_BRIEF_FIELD_LABELS,
  PRODUCT_BRIEF_LIMITS,
  type ProductBriefPayload,
} from "./product-brief.types";
import type {
  IntakeMessage,
  IntakeProvenance,
  ProductIntakeDraft,
  ProductIntakeFieldKey,
  ProductIntakeProvenanceMap,
  ProductIntakeReadiness,
  ProductIntakeSession,
  ProductIntakeState,
} from "./product-intake.types";

export const PRODUCT_INTAKE_OPENING_MESSAGE =
  "你好，我会通过对话帮你把后续确认需要的产品信息问完整。\n\n先告诉我，你这个产品叫什么，主要是做什么的？";

export const PRODUCT_INTAKE_PLACEHOLDER_REPLY =
  "AI 引导将在下一阶段接入。你也可以先在右侧直接补充产品信息。";

const STATUS_LABELS: Record<ProductIntakeState, string> = {
  EMPTY: "未开始",
  IN_PROGRESS: "整理中",
  READY_TO_CONFIRM: "待确认",
  CONFIRMED: "已确认",
};

const MISSING_LABELS: Record<string, string> = {
  productName: "产品名称",
  industry: "所属行业",
  businessGoal: "业务目标",
  targetAudience: "目标用户",
  description: "产品介绍/卖点",
  descriptionOrSellingPoints: "产品介绍/卖点",
};

/** Guided Confirm checklist — mirrors backend PRODUCT_INTAKE_GUIDED_REQUIRED_FIELDS. */
export const PRODUCT_INTAKE_COMPLETENESS_ITEMS: {
  key: ProductIntakeFieldKey | "productDescription";
  label: string;
  isComplete: (draft: ProductIntakeDraft) => boolean;
}[] = [
  {
    key: "productName",
    label: "产品名称",
    isComplete: (draft) => Boolean(trimText(draft.productName)),
  },
  {
    key: "industry",
    label: "所属行业",
    isComplete: (draft) => Boolean(trimText(draft.industry)),
  },
  {
    key: "targetAudience",
    label: "目标用户",
    isComplete: (draft) => Boolean(trimText(draft.targetAudience)),
  },
  {
    key: "businessGoal",
    label: "业务目标",
    isComplete: (draft) => Boolean(trimText(draft.businessGoal)),
  },
  {
    key: "productDescription",
    label: "产品介绍",
    isComplete: (draft) =>
      Boolean(trimText(draft.description)) || Boolean(draft.sellingPoints?.some((item) => item.trim())),
  },
];

export function productIntakeSessionKey(projectId: string): string {
  return `acf:intake:${projectId}:product`;
}

export function productIntakeStatusLabel(state: ProductIntakeState): string {
  return STATUS_LABELS[state];
}

export function emptyProductIntakeDraft(): ProductIntakeDraft {
  return {};
}

export function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOpeningMessages(now = new Date().toISOString()): IntakeMessage[] {
  return [
    {
      id: createMessageId(),
      role: "assistant",
      content: PRODUCT_INTAKE_OPENING_MESSAGE,
      createdAt: now,
      localKind: "LOCAL_GUIDED_PROMPT",
    },
  ];
}

export function createLocalPlaceholderReply(now = new Date().toISOString()): IntakeMessage {
  return {
    id: createMessageId(),
    role: "assistant",
    content: PRODUCT_INTAKE_PLACEHOLDER_REPLY,
    createdAt: now,
    localKind: "LOCAL_PLACEHOLDER_REPLY",
  };
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
function normalizeStringList(value: string[] | undefined, maxItems: number, maxItemLength: number): string[] | undefined {
  if (!value?.length) {
    return undefined;
  }
  const next = normalizeListItems(value, maxItems, maxItemLength);
  return next.length ? next : undefined;
}

/** True if draft holds any user-visible content (including draft-only). */
export function draftHasContent(draft: ProductIntakeDraft): boolean {
  const keys = Object.keys(draft) as ProductIntakeFieldKey[];
  for (const key of keys) {
    const value = draft[key];
    if (typeof value === "string" && value.trim()) {
      return true;
    }
    if (Array.isArray(value) && value.some((item) => item.trim())) {
      return true;
    }
  }
  return false;
}

export function getProductIntakeReadiness(draft: ProductIntakeDraft): ProductIntakeReadiness {
  const missingFields: ProductIntakeFieldKey[] = [];
  const missingLabels: string[] = [];

  if (!trimText(draft.productName)) {
    missingFields.push("productName");
    missingLabels.push(MISSING_LABELS.productName);
  }
  if (!trimText(draft.industry)) {
    missingFields.push("industry");
    missingLabels.push(MISSING_LABELS.industry);
  }
  if (!trimText(draft.businessGoal)) {
    missingFields.push("businessGoal");
    missingLabels.push(MISSING_LABELS.businessGoal);
  }
  if (!trimText(draft.targetAudience)) {
    missingFields.push("targetAudience");
    missingLabels.push(MISSING_LABELS.targetAudience);
  }

  const hasDescription = Boolean(trimText(draft.description));
  const hasSellingPoints = Boolean(draft.sellingPoints?.some((item) => item.trim()));
  if (!hasDescription && !hasSellingPoints) {
    // Represent as description for UI/edit focus; label covers both.
    missingFields.push("description");
    missingLabels.push(MISSING_LABELS.description);
  }

  return {
    missingFields,
    missingLabels,
    readyForConfirmation: missingFields.length === 0,
  };
}

export function formatMissingFieldsHint(missingLabels: string[]): string {
  if (missingLabels.length === 0) {
    return "";
  }
  if (missingLabels.length === 1) {
    return `还需要和 AI 补充：${missingLabels[0]}`;
  }
  return `还需要和 AI 补充剩余 ${missingLabels.length} 项：${missingLabels.join("、")}`;
}

/**
 * Deterministic state machine.
 * CONFIRMED only when a current brief exists and intake is not active.
 */
export function resolveProductIntakeState(options: {
  hasCurrentBrief: boolean;
  draft: ProductIntakeDraft;
  active: boolean;
}): ProductIntakeState {
  const { hasCurrentBrief, draft, active } = options;
  if (hasCurrentBrief && !active) {
    return "CONFIRMED";
  }
  const readiness = getProductIntakeReadiness(draft);
  if (readiness.readyForConfirmation) {
    return "READY_TO_CONFIRM";
  }
  if (draftHasContent(draft) || (active && hasCurrentBrief)) {
    return "IN_PROGRESS";
  }
  return "EMPTY";
}

export function draftFromProductBriefPayload(payload: ProductBriefPayload): ProductIntakeDraft {
  const draft: ProductIntakeDraft = {
    productName: payload.productName,
    industry: payload.industry,
    businessGoal: payload.businessGoal,
  };
  if (payload.targetAudience) draft.targetAudience = payload.targetAudience;
  if (payload.description) draft.description = payload.description;
  if (payload.sellingPoints?.length) draft.sellingPoints = [...payload.sellingPoints];
  if (payload.category) draft.category = payload.category;
  if (payload.brand) draft.brand = payload.brand;
  if (payload.priceRange) draft.priceRange = payload.priceRange;
  if (payload.conversionGoal) draft.conversionGoal = payload.conversionGoal;
  if (payload.tone) draft.tone = payload.tone;
  if (payload.constraints?.length) draft.constraints = [...payload.constraints];
  if (payload.referenceCompetitors?.length) draft.referenceCompetitors = [...payload.referenceCompetitors];
  if (payload.seedKeywords?.length) draft.seedKeywords = [...payload.seedKeywords];
  return draft;
}

function appendUnique(target: string[], items: string[], maxItems: number, maxItemLength: number): string[] {
  return normalizeListItems([...target, ...items], maxItems, maxItemLength);
}

function asParagraphLines(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

/**
 * Map intake draft → existing createProductBrief body.
 * Folds draft-only fields; strips provenance / messages / ids.
 */
export function mapProductIntakeDraftToCreateDto(draft: ProductIntakeDraft): ProductBriefPayload {
  const productName = trimText(draft.productName) ?? "";
  const industry = trimText(draft.industry) ?? "";
  const businessGoal = trimText(draft.businessGoal) ?? "";

  let description = trimText(draft.description) ?? "";
  const usageScenario = trimText(draft.usageScenario);
  const painPoints = normalizeStringList(draft.painPoints, PRODUCT_BRIEF_LIMITS.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoint) ?? [];

  const descriptionExtra: string[] = [];
  if (usageScenario) {
    descriptionExtra.push(`使用场景：${usageScenario}`);
  }
  if (painPoints.length) {
    descriptionExtra.push(`用户痛点：${painPoints.join("；")}`);
  }
  if (descriptionExtra.length) {
    description = asParagraphLines([description, ...descriptionExtra]).slice(0, PRODUCT_BRIEF_LIMITS.description);
  }

  let sellingPoints = normalizeStringList(draft.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoint) ?? [];
  const differentiation = trimText(draft.differentiation);
  if (differentiation) {
    sellingPoints = appendUnique(sellingPoints, [differentiation], PRODUCT_BRIEF_LIMITS.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoint);
  }
  // If no selling points but pain points exist, surface pain points as selling-context bullets when description already has them —
  // still allow confirm via description alone. Optionally fold leftover pain into sellingPoints when description is empty of selling.
  if (!sellingPoints.length && painPoints.length && !description) {
    sellingPoints = appendUnique([], painPoints, PRODUCT_BRIEF_LIMITS.sellingPoints, PRODUCT_BRIEF_LIMITS.sellingPoint);
  }

  const payload: ProductBriefPayload = {
    productName,
    industry,
    businessGoal,
  };

  const targetAudience = trimText(draft.targetAudience);
  const category = trimText(draft.category);
  const brand = trimText(draft.brand);
  const priceRange = trimText(draft.priceRange);
  const conversionGoal = trimText(draft.conversionGoal);
  const tone = trimText(draft.tone);
  const constraints = normalizeStringList(draft.constraints, PRODUCT_BRIEF_LIMITS.constraints, PRODUCT_BRIEF_LIMITS.constraint);
  const referenceCompetitors = normalizeStringList(
    draft.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.referenceCompetitors,
    PRODUCT_BRIEF_LIMITS.competitor,
  );
  const seedKeywords = normalizeStringList(draft.seedKeywords, PRODUCT_BRIEF_LIMITS.seedKeywords, PRODUCT_BRIEF_LIMITS.seedKeyword);

  if (targetAudience) payload.targetAudience = targetAudience.slice(0, PRODUCT_BRIEF_LIMITS.targetAudience);
  if (description) payload.description = description.slice(0, PRODUCT_BRIEF_LIMITS.description);
  if (sellingPoints.length) payload.sellingPoints = sellingPoints;
  if (category) payload.category = category.slice(0, PRODUCT_BRIEF_LIMITS.category);
  if (brand) payload.brand = brand.slice(0, PRODUCT_BRIEF_LIMITS.brand);
  if (priceRange) payload.priceRange = priceRange.slice(0, PRODUCT_BRIEF_LIMITS.priceRange);
  if (conversionGoal) payload.conversionGoal = conversionGoal.slice(0, PRODUCT_BRIEF_LIMITS.conversionGoal);
  if (tone) payload.tone = tone.slice(0, PRODUCT_BRIEF_LIMITS.tone);
  if (constraints?.length) payload.constraints = constraints;
  if (referenceCompetitors?.length) payload.referenceCompetitors = referenceCompetitors;
  if (seedKeywords?.length) payload.seedKeywords = seedKeywords;

  // Guard: never leak draft-only or meta keys into formal payload.
  const allowed = new Set([
    "productName",
    "industry",
    "businessGoal",
    "category",
    "brand",
    "description",
    "sellingPoints",
    "targetAudience",
    "priceRange",
    "conversionGoal",
    "constraints",
    "tone",
    "referenceCompetitors",
    "seedKeywords",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      delete (payload as Record<string, unknown>)[key];
    }
  }

  return payload;
}

export function markFieldUserProvided(
  provenance: ProductIntakeProvenanceMap,
  field: ProductIntakeFieldKey,
): ProductIntakeProvenanceMap {
  return { ...provenance, [field]: "USER_PROVIDED" };
}

export function markFieldProvenance(
  provenance: ProductIntakeProvenanceMap,
  field: ProductIntakeFieldKey,
  source: IntakeProvenance,
): ProductIntakeProvenanceMap {
  return { ...provenance, [field]: source };
}

export function patchProductIntakeDraft(
  draft: ProductIntakeDraft,
  patch: Partial<ProductIntakeDraft>,
  provenance: ProductIntakeProvenanceMap,
  source: IntakeProvenance = "USER_PROVIDED",
): { draft: ProductIntakeDraft; provenance: ProductIntakeProvenanceMap } {
  const nextDraft: ProductIntakeDraft = { ...draft };
  let nextProvenance = { ...provenance };
  for (const [rawKey, rawValue] of Object.entries(patch) as [
    ProductIntakeFieldKey,
    ProductIntakeDraft[ProductIntakeFieldKey],
  ][]) {
    if (rawValue === undefined) {
      continue;
    }
    nextDraft[rawKey] = rawValue as never;
    nextProvenance = markFieldProvenance(nextProvenance, rawKey, source);
  }
  return { draft: nextDraft, provenance: nextProvenance };
}

export function applyProductIntakeSuggestion(
  draft: ProductIntakeDraft,
  provenance: ProductIntakeProvenanceMap,
  suggestion: { field: ProductIntakeFieldKey; value: string | string[] },
): { draft: ProductIntakeDraft; provenance: ProductIntakeProvenanceMap } {
  return patchProductIntakeDraft(
    draft,
    { [suggestion.field]: suggestion.value },
    provenance,
    "USER_CONFIRMED_AI_SUGGESTION",
  );
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function loadProductIntakeSession(projectId: string): ProductIntakeSession | null {
  if (!canUseSessionStorage() || !projectId) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(productIntakeSessionKey(projectId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ProductIntakeSession;
    if (!parsed || typeof parsed !== "object" || !parsed.draft || !Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      draft: parsed.draft ?? {},
      messages: parsed.messages ?? [],
      provenance: parsed.provenance ?? {},
      active: Boolean(parsed.active),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveProductIntakeSession(projectId: string, session: ProductIntakeSession): void {
  if (!canUseSessionStorage() || !projectId) {
    return;
  }
  const safe: ProductIntakeSession = {
    draft: session.draft,
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(message.localKind ? { localKind: message.localKind } : {}),
      ...(message.suggestions?.length ? { suggestions: message.suggestions } : {}),
    })),
    provenance: session.provenance,
    active: session.active,
    updatedAt: session.updatedAt,
  };
  window.sessionStorage.setItem(productIntakeSessionKey(projectId), JSON.stringify(safe));
}

export function clearProductIntakeSession(projectId: string): void {
  if (!canUseSessionStorage() || !projectId) {
    return;
  }
  window.sessionStorage.removeItem(productIntakeSessionKey(projectId));
}

export function createFreshGuidedSession(defaults?: Partial<ProductIntakeDraft>): ProductIntakeSession {
  const now = new Date().toISOString();
  return {
    draft: { ...emptyProductIntakeDraft(), ...defaults },
    messages: createOpeningMessages(now),
    provenance: {},
    active: true,
    updatedAt: now,
  };
}

export function createRefineSessionFromBrief(payload: ProductBriefPayload): ProductIntakeSession {
  const now = new Date().toISOString();
  return {
    draft: draftFromProductBriefPayload(payload),
    messages: [
      {
        id: createMessageId(),
        role: "assistant",
        content:
          "我已经读取了你当前确认的产品信息。这次想先改哪一块？也可以继续补充卖点、关键词或限制。",
        createdAt: now,
        localKind: "LOCAL_GUIDED_PROMPT",
      },
    ],
    provenance: {},
    active: true,
    updatedAt: now,
  };
}

export const PRODUCT_INTAKE_SUMMARY_FIELDS: {
  key: ProductIntakeFieldKey;
  label: string;
  kind: "text" | "textarea" | "list";
}[] = [
  { key: "productName", label: "产品名称", kind: "text" },
  { key: "industry", label: "所属行业", kind: "text" },
  { key: "businessGoal", label: "业务目标", kind: "textarea" },
  { key: "targetAudience", label: "目标用户", kind: "textarea" },
  { key: "description", label: "产品简介", kind: "textarea" },
  { key: "sellingPoints", label: "核心卖点", kind: "list" },
  { key: "seedKeywords", label: "关键词", kind: "list" },
  { key: "constraints", label: "限制/备注", kind: "list" },
  { key: "painPoints", label: "用户痛点", kind: "list" },
  { key: "differentiation", label: "差异化", kind: "text" },
  { key: "usageScenario", label: "使用场景", kind: "textarea" },
];

export function humanizeProductIntakeConfirmError(error: unknown): string {
  void error;
  return "产品信息保存失败，你填写的内容仍然保留，请重试。";
}

export { PRODUCT_BRIEF_FIELD_LABELS, PRODUCT_BRIEF_LIMITS };

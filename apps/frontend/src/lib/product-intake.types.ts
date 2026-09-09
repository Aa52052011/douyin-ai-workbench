import type { ProductBriefPayload } from "./product-brief.types";

/** Draft-level provenance. V1: user edits → USER_PROVIDED. AI turn reserved for 12.12C. */
export type IntakeProvenance =
  | "USER_PROVIDED"
  | "USER_CONFIRMED_AI_SUGGESTION"
  | "AI_UNCONFIRMED_SUGGESTION";

export type ProductIntakeState = "EMPTY" | "IN_PROGRESS" | "READY_TO_CONFIRM" | "CONFIRMED";

export type IntakeMessageRole = "user" | "assistant" | "system-local";

/**
 * Session draft aligned to ProductBriefPayload + draft-only fields.
 * Draft-only fields fold into formal payload on confirm.
 */
export type ProductIntakeDraft = {
  productName?: string;
  industry?: string;
  businessGoal?: string;
  targetAudience?: string;
  description?: string;
  sellingPoints?: string[];
  category?: string;
  brand?: string;
  priceRange?: string;
  conversionGoal?: string;
  tone?: string;
  constraints?: string[];
  referenceCompetitors?: string[];
  seedKeywords?: string[];
  /** DRAFT_ONLY → fold into description / sellingPoints */
  painPoints?: string[];
  /** DRAFT_ONLY → fold into sellingPoints */
  differentiation?: string;
  /** DRAFT_ONLY → fold into description */
  usageScenario?: string;
};

export type ProductIntakeFieldKey = keyof ProductIntakeDraft;

export type IntakeSuggestion = {
  id: string;
  field: ProductIntakeFieldKey;
  value: string | string[];
  label?: string;
  status?: "pending" | "adopted" | "ignored";
};

export type IntakeMessage = {
  id: string;
  role: IntakeMessageRole;
  content: string;
  createdAt: string;
  /** Local scripted opening only — never AgentRun / provider metadata. */
  localKind?: "LOCAL_GUIDED_PROMPT" | "LOCAL_PLACEHOLDER_REPLY";
  suggestions?: IntakeSuggestion[];
};

export type ProductIntakeProvenanceMap = Partial<Record<ProductIntakeFieldKey, IntakeProvenance>>;

export type ProductIntakeSession = {
  draft: ProductIntakeDraft;
  messages: IntakeMessage[];
  provenance: ProductIntakeProvenanceMap;
  /** True while user is in guided/manual refine flow (not pure CONFIRMED view). */
  active: boolean;
  updatedAt: string;
};

export type ProductIntakeReadiness = {
  missingFields: ProductIntakeFieldKey[];
  missingLabels: string[];
  readyForConfirmation: boolean;
};

export type ProductIntakeViewMode = "confirmed" | "guided" | "manual";

export type FormalProductBriefFields = keyof ProductBriefPayload;

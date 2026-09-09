/** Draft-level provenance for Market Intake (12.12E/F). */
export type MarketIntakeProvenance =
  | "USER_PROVIDED"
  | "USER_CONFIRMED_AI_SUGGESTION"
  | "IMPORTED_SOURCE"
  | "AI_UNCONFIRMED_SUGGESTION";

export type MarketIntakeState = "EMPTY" | "IN_PROGRESS" | "READY_TO_CONFIRM" | "CONFIRMED";

export type MarketIntakeMessageRole = "user" | "assistant" | "system-local";

export type MarketCompetitorAccountDraft = {
  displayName: string;
  note?: string;
  profileUrl?: string;
};

export type MarketLinkDraft = {
  url: string;
  label?: string;
};

/**
 * Frontend draft for Guided Market Intake.
 * Maps to MANUAL MarketResearch items on confirm — not MarketInsight.
 */
export type MarketIntakeDraft = {
  keywords: string[];
  competitorAccounts: MarketCompetitorAccountDraft[];
  competitorVideos: MarketLinkDraft[];
  publicLinks: MarketLinkDraft[];
  userObservations: string[];
  customerQuestions: string[];
  commonPainPoints: string[];
  commonSellingPoints: string[];
  marketHypotheses: string[];
  /** Display-only / future; import stays parallel path in V1. */
  uploadedSources: string[];
  userAcknowledgedLimitedData: boolean;
};

export type MarketIntakeFieldKey = keyof MarketIntakeDraft;

export type MarketIntakeSuggestion = {
  id: string;
  field: MarketIntakeFieldKey | string;
  value: string | string[] | MarketCompetitorAccountDraft | MarketLinkDraft;
  label?: string;
  rationale?: string;
  status?: "pending" | "adopted" | "ignored";
};

export type MarketIntakeMessage = {
  id: string;
  role: MarketIntakeMessageRole;
  content: string;
  createdAt: string;
  localKind?: "LOCAL_GUIDED_PROMPT" | "LOCAL_PLACEHOLDER_REPLY";
  suggestions?: MarketIntakeSuggestion[];
};

export type MarketIntakeProvenanceMap = Partial<Record<string, MarketIntakeProvenance>>;

export type MarketIntakeSession = {
  draft: MarketIntakeDraft;
  messages: MarketIntakeMessage[];
  provenance: MarketIntakeProvenanceMap;
  active: boolean;
  updatedAt: string;
};

export type MarketIntakeReadiness = {
  itemCount: number;
  hasResearchMaterial: boolean;
  userAcknowledgedLimitedData: boolean;
  readyForConfirmation: boolean;
  hint: string;
};

export type MarketIntakeViewMode = "confirmed" | "guided" | "import";

/** Patch from market.intake turn — never includes userAcknowledgedLimitedData. */
export type MarketIntakeDraftPatch = Partial<
  Pick<
    MarketIntakeDraft,
    | "keywords"
    | "competitorAccounts"
    | "competitorVideos"
    | "publicLinks"
    | "userObservations"
    | "customerQuestions"
    | "commonPainPoints"
    | "commonSellingPoints"
    | "marketHypotheses"
  >
>;

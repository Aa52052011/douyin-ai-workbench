import type { MarketSourceDraftEntry } from "./market-source";
import {
  isMarketSourceRole,
  isMarketSourceType,
  type MarketSourceProvenance,
} from "./market-source";

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
 * Step 13.4: sources[] is provenance SoT; keywords/competitors remain convenience fields.
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
  /** Step 13.4 structured sources (excludes PRODUCTION_ASSET after handoff). */
  sources: MarketSourceDraftEntry[];
  researchRequested: boolean;
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
    | "sources"
    | "researchRequested"
  >
>;

export function normalizeMarketSourceEntries(raw: unknown): MarketSourceDraftEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketSourceDraftEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isMarketSourceRole(row.role) || !isMarketSourceType(row.sourceType)) continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const provenance = (
      typeof row.provenance === "string" ? row.provenance : "USER_PROVIDED"
    ) as MarketSourceProvenance;
    out.push({
      id: row.id.trim(),
      role: row.role,
      sourceType: row.sourceType,
      provenance: (["USER_PROVIDED", "SYSTEM_DISCOVERED", "PLATFORM_API", "UPLOADED", "MANUAL"] as string[]).includes(
        provenance,
      )
        ? provenance
        : "USER_PROVIDED",
      capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : new Date().toISOString(),
      ...(typeof row.platform === "string" ? { platform: row.platform } : {}),
      ...(typeof row.title === "string" ? { title: row.title } : {}),
      ...(typeof row.text === "string" ? { text: row.text } : {}),
      ...(typeof row.url === "string" ? { url: row.url } : {}),
      ...(typeof row.canonicalUrl === "string" ? { canonicalUrl: row.canonicalUrl } : {}),
      ...(typeof row.assetId === "string" ? { assetId: row.assetId } : {}),
      ...(typeof row.competitorName === "string" ? { competitorName: row.competitorName } : {}),
      ...(typeof row.keyword === "string" ? { keyword: row.keyword } : {}),
      ...(typeof row.label === "string" ? { label: row.label } : {}),
      ...(typeof row.userNote === "string" ? { userNote: row.userNote } : {}),
      ...(typeof row.reasonForReference === "string" ? { reasonForReference: row.reasonForReference } : {}),
    });
  }
  return out;
}

import { api } from "./api";
import type { ManualMarketPreviewBody } from "./market-intake";
import type {
  MarketIntakeDraft,
  MarketIntakeDraftPatch,
  MarketIntakeSuggestion,
} from "./market-intake.types";
import type { MarketResearchRecord } from "./market-research.types";

export type MarketResearchPreviewResult = {
  productBriefId?: string;
  collectedAt?: string;
  items?: unknown[];
  warnings?: string[];
  duplicateCount?: number;
  sampleStats?: Record<string, unknown>;
  dataQuality?: Record<string, unknown>;
};

export type MarketIntakeTurnRequest = {
  clientTurnId: string;
  userMessage: string;
  draft: MarketIntakeDraftPatch & { userAcknowledgedLimitedData?: boolean };
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  improvingExisting?: boolean;
  userAcknowledgedLimitedData?: boolean;
  locale?: string;
};

export type MarketIntakeTurnResponse = {
  message: string;
  draftPatch: MarketIntakeDraftPatch;
  suggestions: Array<Omit<MarketIntakeSuggestion, "status">>;
  missingAreas: string[];
  readyForConfirmation: boolean;
  requestId: string;
};

export function previewManualMarketResearch(
  accessToken: string,
  projectId: string,
  body: ManualMarketPreviewBody,
) {
  return api<MarketResearchPreviewResult>(`/projects/${projectId}/market-research/preview`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export function confirmManualMarketResearch(
  accessToken: string,
  projectId: string,
  body: ManualMarketPreviewBody,
) {
  return api<MarketResearchRecord>(`/projects/${projectId}/market-research/confirm`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export function postMarketIntakeTurn(
  accessToken: string,
  projectId: string,
  body: MarketIntakeTurnRequest,
): Promise<MarketIntakeTurnResponse> {
  return api<MarketIntakeTurnResponse>(`/projects/${projectId}/intake/market/turn`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export type { MarketIntakeDraft };

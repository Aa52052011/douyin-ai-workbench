import { api, apiMaybe } from "./api";
import { createIdempotencyKey } from "./market-research.form";
import type { MarketEvidenceRecord, MarketInsightCreateResult, MarketInsightRecord } from "./market-analysis.types";

export function getMarketEvidence(accessToken: string, researchId: string) {
  return api<MarketEvidenceRecord>(`/market-research/${researchId}/evidence`, { accessToken });
}

export function listMarketInsights(accessToken: string, researchId: string) {
  return api<MarketInsightRecord[]>(`/market-research/${researchId}/insights`, { accessToken });
}

export function getLatestMarketInsight(accessToken: string, researchId: string) {
  return apiMaybe<MarketInsightRecord>(`/market-research/${researchId}/insights/latest`, { accessToken });
}

export function createMarketInsight(
  accessToken: string,
  researchId: string,
  input: { userFocus?: string },
) {
  return api<MarketInsightCreateResult>(`/market-research/${researchId}/insights`, {
    method: "POST",
    accessToken,
    headers: { "x-idempotency-key": createIdempotencyKey() },
    body: JSON.stringify(input.userFocus ? { userFocus: input.userFocus } : {}),
  });
}

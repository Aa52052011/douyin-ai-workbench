import { api, apiMaybe } from "./api";
import type { CampaignStrategyGenerateResult, CampaignStrategyRecord } from "./campaign-strategy.types";
import type { StrategyFormState } from "./campaign-strategy.types";
import { generateRequestBody } from "./campaign-strategy.form";

export function listCampaignStrategies(accessToken: string, projectId: string) {
  return api<CampaignStrategyRecord[]>(`/projects/${projectId}/campaign-strategies`, { accessToken });
}

export function getLatestCampaignStrategy(accessToken: string, projectId: string) {
  return apiMaybe<CampaignStrategyRecord>(`/projects/${projectId}/campaign-strategies/latest`, { accessToken });
}

export function getCampaignStrategy(accessToken: string, id: string) {
  return api<CampaignStrategyRecord>(`/campaign-strategies/${id}`, { accessToken });
}

export function generateCampaignStrategy(
  accessToken: string,
  projectId: string,
  form: StrategyFormState,
  input: { productBriefId?: string; idempotencyKey: string },
) {
  return api<CampaignStrategyGenerateResult>(`/projects/${projectId}/campaign-strategies/generate`, {
    method: "POST",
    accessToken,
    headers: { "x-idempotency-key": input.idempotencyKey },
    body: JSON.stringify(generateRequestBody(form, input.productBriefId)),
  });
}

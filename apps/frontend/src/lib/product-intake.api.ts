import { api } from "./api";
import type { ProductIntakeDraft, ProductIntakeFieldKey } from "./product-intake.types";

export type ProductIntakeTurnSuggestion = {
  id: string;
  field: ProductIntakeFieldKey;
  value: string | string[];
  label?: string;
};

export type ProductIntakeTurnRequest = {
  clientTurnId: string;
  userMessage: string;
  draft: ProductIntakeDraft;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  improvingExisting?: boolean;
  locale?: string;
};

export type ProductIntakeTurnResponse = {
  message: string;
  draftPatch: ProductIntakeDraft;
  suggestions: ProductIntakeTurnSuggestion[];
  missingFields: string[];
  readyForConfirmation: boolean;
  requestId: string;
};

export function postProductIntakeTurn(
  accessToken: string,
  projectId: string,
  body: ProductIntakeTurnRequest,
): Promise<ProductIntakeTurnResponse> {
  return api<ProductIntakeTurnResponse>(`/projects/${projectId}/intake/product/turn`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

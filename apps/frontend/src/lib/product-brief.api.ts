import { api, apiMaybe } from "./api";
import type { ProductBriefPayload, ProductBriefRecord } from "./product-brief.types";

export function listProductBriefs(accessToken: string, projectId: string) {
  return api<ProductBriefRecord[]>(`/projects/${projectId}/product-briefs`, { accessToken });
}

export function getCurrentProductBrief(accessToken: string, projectId: string) {
  return apiMaybe<ProductBriefRecord>(`/projects/${projectId}/product-briefs/current`, { accessToken });
}

export function getProductBriefById(accessToken: string, id: string) {
  return api<ProductBriefRecord>(`/product-briefs/${id}`, { accessToken });
}

export function createProductBrief(accessToken: string, projectId: string, payload: ProductBriefPayload) {
  return api<ProductBriefRecord>(`/projects/${projectId}/product-briefs`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(payload),
  });
}

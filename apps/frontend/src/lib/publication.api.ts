import { api } from "./api";
import { completePublicationBody, createPublicationBody, newIdempotencyKey } from "./publication.form";
import type { PublicationCompleteForm, PublicationRecord } from "./publication.types";

export function listPublications(accessToken: string, projectId: string, query?: { videoId?: string }) {
  const params = new URLSearchParams({ projectId });
  if (query?.videoId) params.set("videoId", query.videoId);
  return api<PublicationRecord[]>(`/publications?${params.toString()}`, { accessToken });
}

export function getPublication(accessToken: string, id: string) {
  return api<PublicationRecord>(`/publications/${id}`, { accessToken });
}

export function createPublication(accessToken: string, videoId: string, title: string) {
  return api<PublicationRecord>(`/videos/${videoId}/publications`, {
    method: "POST",
    accessToken,
    headers: { "x-idempotency-key": newIdempotencyKey() },
    body: JSON.stringify(createPublicationBody(title)),
  });
}

export function completeManualPublication(accessToken: string, id: string, form: PublicationCompleteForm) {
  return api<PublicationRecord>(`/publications/${id}/manual-complete`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(completePublicationBody(form)),
  });
}

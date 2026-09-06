import { api } from "./api";
import { createPlanBody } from "./content-planning.form";
import type { ContentPlanRecord, PlanningFormState } from "./content-planning.types";

export function listContentPlans(accessToken: string, projectId: string) {
  return api<ContentPlanRecord[]>(`/content-plans?projectId=${encodeURIComponent(projectId)}`, { accessToken });
}

export function getContentPlan(accessToken: string, id: string) {
  return api<ContentPlanRecord>(`/content-plans/${id}`, { accessToken });
}

export function createContentPlan(accessToken: string, projectId: string, form: PlanningFormState) {
  return api<ContentPlanRecord>("/content-plans", {
    method: "POST",
    accessToken,
    body: JSON.stringify(createPlanBody(projectId, form)),
  });
}

export function confirmContentPlan(accessToken: string, id: string) {
  return api<ContentPlanRecord>(`/content-plans/${id}/confirm`, {
    method: "POST",
    accessToken,
  });
}

export function archiveContentPlan(accessToken: string, id: string) {
  return api<ContentPlanRecord>(`/content-plans/${id}/archive`, {
    method: "POST",
    accessToken,
  });
}

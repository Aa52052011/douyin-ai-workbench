import { api } from "./api";
import { createScriptBody, draftPatchBody } from "./script.form";
import type { ScriptFormState, ScriptPayloadRecord, ScriptRecord } from "./script.types";

export function listScripts(
  accessToken: string,
  projectId: string,
  query?: { contentPlanId?: string; topicId?: string },
) {
  const params = new URLSearchParams({ projectId });
  if (query?.contentPlanId) params.set("contentPlanId", query.contentPlanId);
  if (query?.topicId) params.set("topicId", query.topicId);
  return api<ScriptRecord[]>(`/scripts?${params.toString()}`, { accessToken });
}

export function getScript(accessToken: string, id: string) {
  return api<ScriptRecord>(`/scripts/${id}`, { accessToken });
}

export function createScript(accessToken: string, form: ScriptFormState) {
  return api<ScriptRecord>("/scripts", {
    method: "POST",
    accessToken,
    body: JSON.stringify(createScriptBody(form)),
  });
}

export function updateScriptDraft(accessToken: string, id: string, payload: ScriptPayloadRecord) {
  return api<ScriptRecord>(`/scripts/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(draftPatchBody(payload)),
  });
}

export function confirmScript(accessToken: string, id: string) {
  return api<ScriptRecord>(`/scripts/${id}/confirm`, {
    method: "POST",
    accessToken,
  });
}

export function archiveScript(accessToken: string, id: string) {
  return api<ScriptRecord>(`/scripts/${id}/archive`, {
    method: "POST",
    accessToken,
  });
}

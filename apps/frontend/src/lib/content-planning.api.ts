import { api } from "./api";
import { createPlanBody } from "./content-planning.form";
import type { ContentPlanRecord, PlanningFormState } from "./content-planning.types";
import { POSITIONING_POLL_ATTEMPTS, POSITIONING_POLL_INTERVAL_MS } from "./positioning.api";
import { isGeneratingStatus } from "./positioning.form";
import type { AgentRun } from "./types";

const CONTENT_PLANNING_AGENT_ID = "content.planning";

export function listContentPlans(accessToken: string, projectId: string) {
  return api<ContentPlanRecord[]>(`/content-plans?projectId=${encodeURIComponent(projectId)}`, { accessToken });
}

export function getContentPlan(accessToken: string, id: string) {
  return api<ContentPlanRecord>(`/content-plans/${id}`, { accessToken });
}

export function listContentPlanningRuns(accessToken: string, projectId: string) {
  return api<AgentRun[]>(
    `/agents/runs?projectId=${encodeURIComponent(projectId)}&agentId=${encodeURIComponent(CONTENT_PLANNING_AGENT_ID)}`,
    { accessToken },
  );
}

function isRetryableCreateFailure(error: unknown): boolean {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  if (status >= 400 && status < 500 && status !== 408) {
    return false;
  }
  return true;
}

export async function recoverContentPlan(
  accessToken: string,
  projectId: string,
  startedAtMs: number,
): Promise<ContentPlanRecord | null> {
  const cutoff = startedAtMs - 15_000;
  for (let attempt = 0; attempt < POSITIONING_POLL_ATTEMPTS; attempt += 1) {
    const plans = await listContentPlans(accessToken, projectId);
    const recovered = plans
      .filter((plan) => {
        const created = Date.parse(plan.createdAt);
        return Number.isFinite(created) && created >= cutoff;
      })
      .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    if (recovered) {
      return recovered;
    }
    const runs = await listContentPlanningRuns(accessToken, projectId).catch(() => [] as AgentRun[]);
    const active = runs.find((run) => {
      const created = Date.parse(run.createdAt);
      return Number.isFinite(created) && created >= cutoff && isGeneratingStatus(run.status);
    });
    if (!active && attempt > 0) {
      const failed = runs.find((run) => {
        const created = Date.parse(run.createdAt);
        return Number.isFinite(created) && created >= cutoff && run.status === "FAILED";
      });
      if (failed) {
        return null;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POSITIONING_POLL_INTERVAL_MS));
  }
  return null;
}

export async function createContentPlan(accessToken: string, projectId: string, form: PlanningFormState) {
  const startedAtMs = Date.now();
  try {
    return await api<ContentPlanRecord>("/content-plans", {
      method: "POST",
      accessToken,
      body: JSON.stringify(createPlanBody(projectId, form)),
    });
  } catch (error) {
    if (!isRetryableCreateFailure(error)) {
      throw error;
    }
    const recovered = await recoverContentPlan(accessToken, projectId, startedAtMs);
    if (!recovered) {
      throw error;
    }
    return recovered;
  }
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

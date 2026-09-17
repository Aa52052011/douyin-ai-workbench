import { api } from "./api";
import { isGeneratingStatus } from "./positioning.form";
import { POSITIONING_AGENT_ID, POSITIONING_AGENT_VERSION, type PositioningInput } from "./positioning.types";
import type { AgentRun } from "./types";

/** Cover production LLM agent budget (210s) plus proxy/network slack. */
export const POSITIONING_POLL_INTERVAL_MS = 2000;
export const POSITIONING_POLL_ATTEMPTS = 120;

export function listPositioningRuns(accessToken: string, projectId: string) {
  return api<AgentRun[]>(
    `/agents/runs?projectId=${encodeURIComponent(projectId)}&agentId=${encodeURIComponent(POSITIONING_AGENT_ID)}`,
    { accessToken },
  );
}

export function getPositioningRun(accessToken: string, runId: string) {
  return api<AgentRun>(`/agents/runs/${runId}`, { accessToken });
}

export async function executePositioning(accessToken: string, projectId: string, input: PositioningInput) {
  return api<AgentRun>("/agents/runs", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      projectId,
      input,
    }),
  });
}

export async function recoverPositioningRun(
  accessToken: string,
  projectId: string,
  startedAtMs: number,
): Promise<AgentRun | null> {
  const runs = await listPositioningRuns(accessToken, projectId);
  const cutoff = startedAtMs - 15_000;
  return (
    runs.find((run) => {
      const created = Date.parse(run.createdAt);
      return Number.isFinite(created) && created >= cutoff;
    }) ?? null
  );
}

export async function waitForPositioningRun(accessToken: string, run: AgentRun): Promise<AgentRun> {
  if (!isGeneratingStatus(run.status)) {
    return run;
  }
  for (let attempt = 0; attempt < POSITIONING_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POSITIONING_POLL_INTERVAL_MS));
    const latest = await getPositioningRun(accessToken, run.id);
    if (!isGeneratingStatus(latest.status)) {
      return latest;
    }
  }
  return run;
}

export async function executeAndAwaitPositioning(
  accessToken: string,
  projectId: string,
  input: PositioningInput,
): Promise<AgentRun> {
  const startedAtMs = Date.now();
  try {
    const started = await executePositioning(accessToken, projectId, input);
    return waitForPositioningRun(accessToken, started);
  } catch (error) {
    const recovered = await recoverPositioningRun(accessToken, projectId, startedAtMs);
    if (!recovered) {
      throw error;
    }
    return waitForPositioningRun(accessToken, recovered);
  }
}

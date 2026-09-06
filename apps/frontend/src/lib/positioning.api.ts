import { api } from "./api";
import { isGeneratingStatus } from "./positioning.form";
import { POSITIONING_AGENT_ID, POSITIONING_AGENT_VERSION, type PositioningInput } from "./positioning.types";
import type { AgentRun } from "./types";

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

export async function waitForPositioningRun(accessToken: string, run: AgentRun): Promise<AgentRun> {
  if (!isGeneratingStatus(run.status)) {
    return run;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const latest = await getPositioningRun(accessToken, run.id);
    if (!isGeneratingStatus(latest.status)) {
      return latest;
    }
  }
  return run;
}

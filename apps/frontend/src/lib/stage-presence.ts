import { api, apiMaybe } from "./api";
import type { AgentRun } from "./types";

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export async function hasProductBrief(accessToken: string, projectId: string): Promise<boolean> {
  return (await apiMaybe<unknown>(`/projects/${projectId}/product-briefs/current`, { accessToken })) != null;
}

export async function hasPositioning(accessToken: string, projectId: string): Promise<boolean> {
  const runs = await api<AgentRun[]>(
    `/agents/runs?projectId=${encodeURIComponent(projectId)}&agentId=account.positioning`,
    { accessToken },
  );
  return runs.some((run) => run.status === "COMPLETED" && run.output);
}

export async function hasMarketResearch(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/projects/${projectId}/market-research`, { accessToken }));
}

export async function hasMarketInsight(accessToken: string, projectId: string): Promise<boolean> {
  const researches = await api<Array<{ id: string }>>(`/projects/${projectId}/market-research`, { accessToken });
  if (!hasItems(researches)) {
    return false;
  }
  return hasItems(await api<unknown[]>(`/market-research/${researches[0].id}/insights`, { accessToken }));
}

export async function hasCampaignStrategy(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/projects/${projectId}/campaign-strategies`, { accessToken }));
}

export async function hasContentPlan(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/content-plans?projectId=${encodeURIComponent(projectId)}`, { accessToken }));
}

export async function hasScript(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/scripts?projectId=${encodeURIComponent(projectId)}`, { accessToken }));
}

export async function hasVideo(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/videos?projectId=${encodeURIComponent(projectId)}`, { accessToken }));
}

export async function hasPublication(accessToken: string, projectId: string): Promise<boolean> {
  return hasItems(await api<unknown[]>(`/publications?projectId=${encodeURIComponent(projectId)}`, { accessToken }));
}

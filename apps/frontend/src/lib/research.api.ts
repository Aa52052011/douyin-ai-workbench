import { api } from "./api";

export type LearningPublicView = {
  statusLabel: string;
  summary: string[];
  nextBatchAdjustments: string[];
  dataSufficiency: string;
  lastUpdatedAt: string;
};

export function getLearningSummary(accessToken: string, projectId: string) {
  return api<LearningPublicView>(`/projects/${encodeURIComponent(projectId)}/learning-summary`, { accessToken });
}

export function requestAutonomousResearch(accessToken: string, projectId: string) {
  return api<{ statusLabel: string; limitationSummary: string }>(
    `/projects/${encodeURIComponent(projectId)}/market-research/autonomous`,
    { method: "POST", accessToken },
  );
}

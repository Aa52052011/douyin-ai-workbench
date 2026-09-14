import { listCampaignStrategies } from "./campaign-strategy.api";
import type { CampaignStrategyRecord } from "./campaign-strategy.types";
import { usableStrategies } from "./content-planning.form";
import type { ContentPlanRecord } from "./content-planning.types";
import { parsePlanPayload, planStatusLabel } from "./content-planning.view";
import { listContentPlans } from "./content-planning.api";
import { getLatestMarketInsight } from "./market-analysis.api";
import { sortResearchNewestFirst } from "./market-research.form";
import type { MarketResearchRecord } from "./market-research.types";
import { listMarketResearch } from "./market-research.api";
import { getLatestMetrics } from "./performance.api";
import { parseMetricSnapshot } from "./performance.view";
import { listPositioningRuns } from "./positioning.api";
import { completedPositioningRecords, currentPositioningRecord } from "./positioning.form";
import { getCurrentProductBrief } from "./product-brief.api";
import type { ScriptRecord } from "./script.types";
import {
  belongsToProject,
  buildProjectStages,
  emptyStatusFacts,
  getProjectNextAction,
  isCompletedScriptStatus,
  isProcessingVideoStatus,
  isReadablePlanStatus,
  type ProjectNextAction,
  type ProjectOverviewSummary,
  type ProjectStageMap,
  type ProjectStatusFacts,
} from "./project-status";
import { listPublications } from "./publication.api";
import { parsePublicationRecord } from "./publication.view";
import { listScripts } from "./script.api";
import { parseScriptPayload, scriptStatusLabel } from "./script.view";
import { parseStrategyOutput } from "./campaign-strategy.view";
import type { AgentRun, Project } from "./types";
import { api } from "./api";
import { isEligiblePublishVideo } from "./publication.form";
import { listVideos } from "./video.api";
import type { VideoRecord } from "./video.types";
import { videoStatusLabel } from "./video.view";
import { sortPlansNewestFirst } from "./content-planning.form";
import { sortStrategiesNewestFirst } from "./campaign-strategy.form";

export const INSIGHT_PROBE_LIMIT = 5;
export const METRICS_PROBE_LIMIT = 3;

export type ProjectStatusSnapshot = {
  project: Project;
  stages: ProjectStageMap;
  nextAction: ProjectNextAction;
  facts: ProjectStatusFacts;
  summary: ProjectOverviewSummary;
};

async function settled<T>(task: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await task };
  } catch {
    return { ok: false };
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function probeReadableInsight(
  accessToken: string,
  researchIds: string[],
): Promise<boolean | null> {
  if (researchIds.length === 0) {
    return false;
  }
  let sawError = false;
  for (const researchId of researchIds.slice(0, INSIGHT_PROBE_LIMIT)) {
    const result = await settled(getLatestMarketInsight(accessToken, researchId));
    if (!result.ok) {
      sawError = true;
      continue;
    }
    if (result.value && typeof result.value === "object" && "id" in result.value && result.value.id) {
      return true;
    }
  }
  return sawError ? null : false;
}

export async function probePublicationMetrics(
  accessToken: string,
  publicationIds: string[],
): Promise<{ hasMetrics: boolean | null; publicationId?: string }> {
  if (publicationIds.length === 0) {
    return { hasMetrics: false };
  }
  let sawError = false;
  for (const publicationId of publicationIds.slice(0, METRICS_PROBE_LIMIT)) {
    const result = await settled(getLatestMetrics(accessToken, publicationId));
    if (!result.ok) {
      sawError = true;
      continue;
    }
    if (parseMetricSnapshot(result.value.snapshot)) {
      return { hasMetrics: true, publicationId };
    }
  }
  return { hasMetrics: sawError ? null : false, publicationId: publicationIds[0] };
}

export async function loadProjectStatus(accessToken: string, projectId: string): Promise<ProjectStatusSnapshot> {
  const project = await api<Project>(`/projects/${projectId}`, { accessToken });
  const [briefResult, runsResult, researchResult, strategyResult, planResult, scriptResult, videoResult, publicationResult] =
    await Promise.all([
      settled(getCurrentProductBrief(accessToken, projectId)),
      settled(listPositioningRuns(accessToken, projectId)),
      settled(listMarketResearch(accessToken, projectId)),
      settled(listCampaignStrategies(accessToken, projectId)),
      settled(listContentPlans(accessToken, projectId)),
      settled(listScripts(accessToken, projectId)),
      settled(listVideos(accessToken, projectId)),
      settled(listPublications(accessToken, projectId)),
    ]);

  const facts = emptyStatusFacts();

  if (briefResult.ok) {
    const brief = briefResult.value;
    facts.productPresent = Boolean(brief?.id && belongsToProject(brief, projectId));
    if (brief?.payload?.productName) {
      facts.summary.productName = brief.payload.productName;
    }
  } else {
    facts.productPresent = null;
  }

  if (runsResult.ok) {
    const valid = completedPositioningRecords(asArray<AgentRun>(runsResult.value));
    facts.positioningValid = valid.length > 0;
    const current = currentPositioningRecord(asArray<AgentRun>(runsResult.value));
    if (current?.output.accountPositioning) {
      facts.summary.positioningLine = current.output.accountPositioning;
      facts.summary.targetAudience = current.output.targetAudience.description;
      facts.summary.contentStyle = current.output.persona.tone;
      facts.summary.recommendedLength = current.output.publishingStrategy.recommendedLength;
    }
  } else {
    facts.positioningValid = null;
  }

  if (researchResult.ok) {
    const researches = sortResearchNewestFirst(
      asArray<MarketResearchRecord>(researchResult.value).filter((item) => Boolean(item?.id)),
    );
    facts.researchPresent = researches.length > 0;
    facts.insightPresent = await probeReadableInsight(
      accessToken,
      researches.map((item) => item.id),
    );
  } else {
    facts.researchPresent = null;
    facts.insightPresent = null;
  }

  if (strategyResult.ok) {
    const strategies = sortStrategiesNewestFirst(
      asArray<CampaignStrategyRecord>(strategyResult.value).filter((item) => belongsToProject(item, projectId)),
    );
    const usable = usableStrategies(strategies);
    facts.strategyUsable = usable.length > 0;
    const parsed = usable[0] ? parseStrategyOutput(usable[0].payload) : null;
    if (parsed?.objective?.primaryObjective) {
      facts.summary.strategyObjective = parsed.objective.primaryObjective;
    }
  } else {
    facts.strategyUsable = null;
  }

  if (planResult.ok) {
    const plans = sortPlansNewestFirst(
      asArray<ContentPlanRecord>(planResult.value).filter((item) => belongsToProject(item, projectId)),
    );
    const readable = plans.filter((item) => isReadablePlanStatus(item.status) && parsePlanPayload(item.payload));
    facts.hasReadablePlan = readable.length > 0;
    facts.hasScriptEligiblePlan = readable.some((item) => item.status === "CONFIRMED" || item.status === "ARCHIVED");
    const latest = readable[0];
    if (latest) {
      facts.latestPlanStatus = latest.status;
      if (latest.status === "DRAFT") {
        facts.latestDraftPlanId = latest.id;
      }
      facts.summary.planTitle = parsePlanPayload(latest.payload)?.title || latest.title;
      facts.summary.planStatus = planStatusLabel(latest.status);
    }
  } else {
    facts.hasReadablePlan = null;
    facts.hasScriptEligiblePlan = null;
  }

  if (scriptResult.ok) {
    const scripts = asArray<ScriptRecord>(scriptResult.value)
      .filter((item) => belongsToProject(item, projectId))
      .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
    const completed = scripts.filter((item) => isCompletedScriptStatus(item.status) && parseScriptPayload(item.payload));
    const drafts = scripts.filter((item) => item.status === "DRAFT");
    facts.hasCompletedScript = completed.length > 0;
    facts.hasDraftScript = drafts.length > 0;
    const latestDraft = drafts[0];
    if (latestDraft) {
      facts.draftScriptPlanId = latestDraft.contentPlanId ?? null;
      facts.draftScriptTopicId = latestDraft.topicId ?? null;
    }
    const latestConfirmed = completed.find((item) => item.status === "CONFIRMED");
    facts.latestConfirmedScriptId = latestConfirmed?.id ?? completed[0]?.id ?? null;
    const latest = scripts.find((item) => parseScriptPayload(item.payload));
    if (latest) {
      facts.summary.scriptTitle = parseScriptPayload(latest.payload)?.title || latest.title;
      facts.summary.scriptStatus = scriptStatusLabel(latest.status);
    }
  } else {
    facts.hasCompletedScript = null;
    facts.hasDraftScript = null;
  }

  if (videoResult.ok) {
    const videos = asArray<VideoRecord>(videoResult.value)
      .filter((item) => Boolean(item?.id && item.status && belongsToProject(item, projectId)))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    facts.hasVideo = videos.length > 0;
    facts.hasCompletedVideo = videos.some(isEligiblePublishVideo);
    facts.hasProcessingVideo = videos.some((item) => isProcessingVideoStatus(item.status));
    facts.hasFailedVideo = videos.some((item) => item.status === "FAILED");
    if (videos[0]) {
      facts.summary.videoStatus = videoStatusLabel(videos[0].status);
    }
  } else {
    facts.hasVideo = null;
    facts.hasCompletedVideo = null;
    facts.hasProcessingVideo = null;
    facts.hasFailedVideo = null;
  }

  if (publicationResult.ok) {
    const publications = asArray(publicationResult.value)
      .map(parsePublicationRecord)
      .filter((item): item is NonNullable<typeof item> => Boolean(item && belongsToProject(item, projectId)))
      .sort((a, b) => +new Date(b.publishedAt || b.createdAt) - +new Date(a.publishedAt || a.createdAt));
    const published = publications.filter((item) => item.status === "PUBLISHED");
    const pending = publications.filter((item) => item.status === "PENDING");
    facts.hasPublishedPublication = published.length > 0;
    facts.hasPendingPublication = pending.length > 0;
    facts.pendingPublicationVideoId = pending[0]?.videoId ?? null;
    facts.publishedPublicationId = published[0]?.id ?? null;
    if (published[0]?.title) {
      facts.summary.publicationTitle = published[0].title;
    }
    const metrics = await probePublicationMetrics(
      accessToken,
      published.map((item) => item.id),
    );
    facts.hasMetrics = metrics.hasMetrics;
    if (metrics.publicationId) {
      facts.publishedPublicationId = metrics.publicationId;
    }
    facts.summary.hasMetrics = metrics.hasMetrics === true;
  } else {
    facts.hasPublishedPublication = null;
    facts.hasPendingPublication = null;
    facts.hasMetrics = null;
  }

  const stages = buildProjectStages(facts);
  return {
    project,
    stages,
    nextAction: getProjectNextAction(projectId, facts),
    facts,
    summary: facts.summary,
  };
}

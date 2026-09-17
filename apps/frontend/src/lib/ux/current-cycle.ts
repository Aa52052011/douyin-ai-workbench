import type { ProjectStatusFacts } from "../project-status";

export type CurrentCycleNavId =
  | "overview"
  | "positioning"
  | "plans"
  | "scripts"
  | "videos"
  | "publish"
  | "review";

function topicQuota(facts: ProjectStatusFacts): number | null {
  return typeof facts.latestPlanTopicCount === "number" && facts.latestPlanTopicCount > 0
    ? facts.latestPlanTopicCount
    : null;
}

function quotaMet(done: number | null | undefined, topics: number | null): boolean {
  return topics != null && typeof done === "number" && done >= topics;
}

export function currentCycleScriptsComplete(facts: ProjectStatusFacts): boolean {
  return quotaMet(facts.completedScriptsOnLatestPlan, topicQuota(facts));
}

export function currentCycleVideosComplete(facts: ProjectStatusFacts): boolean {
  return quotaMet(facts.acceptedVideosOnLatestPlan, topicQuota(facts));
}

export function currentCyclePublishComplete(facts: ProjectStatusFacts): boolean {
  return quotaMet(facts.publishedOnLatestPlan, topicQuota(facts));
}

export function currentCycleReviewComplete(facts: ProjectStatusFacts): boolean {
  return facts.hasMetricsOnLatestPlan === true;
}

export function currentCycleWorkflowNavId(facts: ProjectStatusFacts | null): CurrentCycleNavId | null {
  if (!facts) return null;
  if (facts.positioningValid !== true) return "positioning";
  if (!(facts.hasScriptEligiblePlan || facts.latestPlanStatus === "CONFIRMED")) return "plans";
  if (!currentCycleScriptsComplete(facts)) return "scripts";
  if (!currentCycleVideosComplete(facts)) return "videos";
  if (!currentCyclePublishComplete(facts)) return "publish";
  if (!currentCycleReviewComplete(facts)) return "review";
  return "overview";
}

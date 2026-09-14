import { getIntakeDraftPresence } from "./intake-draft-presence";
import type { ProjectStatusSnapshot } from "./load-project-status";
import { type ProjectStatusFacts } from "./project-status";
import { resolveNextActionV2 } from "./ux/next-action-v2";

/**
 * Client-only: merge sessionStorage Intake draft presence into nextAction wording.
 * Does not mutate stage completion (stages come from formal API facts only).
 */
export function withIntakeDraftNextAction(
  projectId: string,
  snapshot: ProjectStatusSnapshot,
): ProjectStatusSnapshot {
  const presence = getIntakeDraftPresence(projectId);
  const facts: ProjectStatusFacts = {
    ...snapshot.facts,
    productIntakeDraftPresent: presence.productWorkInProgress,
    marketIntakeDraftPresent: presence.marketWorkInProgress,
    productIntakeImproveActive: presence.productImproveActive,
    marketIntakeImproveActive: presence.marketImproveActive,
  };
  return {
    ...snapshot,
    facts,
    nextAction: resolveNextActionV2(projectId, facts),
  };
}

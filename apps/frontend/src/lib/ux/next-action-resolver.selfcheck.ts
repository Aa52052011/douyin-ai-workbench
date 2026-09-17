import assert from "node:assert/strict";
import { emptyStatusFacts } from "../project-status";
import { latestPlanNeedsScripts, resolveNextActionV2 } from "./next-action-v2";

function run() {
  assert.equal(latestPlanNeedsScripts(emptyStatusFacts()), false);
  const v2 = resolveNextActionV2("p1", {
    ...emptyStatusFacts(),
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
    hasReadablePlan: true,
    hasScriptEligiblePlan: true,
    latestPlanStatus: "CONFIRMED",
    latestPlanId: "plan-2",
    latestPlanTopicCount: 7,
    completedScriptsOnLatestPlan: 0,
    draftScriptsOnLatestPlan: 0,
    hasCompletedScript: true,
    hasMetrics: true,
  });
  assert.match(v2.href, /content\/scripts/);
  assert.equal(v2.label.includes("AI复盘"), false);
  console.log("next-action-resolver selfcheck PASS");
}

run();

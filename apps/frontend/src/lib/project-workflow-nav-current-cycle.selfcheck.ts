import assert from "node:assert/strict";
import { emptyStatusFacts, type ProjectStatusFacts } from "./project-status";
import {
  isProjectNavItemDone,
  projectWorkflowMark,
  workflowMarkSymbol,
} from "./project-nav";
import { currentCycleWorkflowNavId } from "./ux/current-cycle";

function facts(partial: Partial<ProjectStatusFacts>): ProjectStatusFacts {
  return { ...emptyStatusFacts(), ...partial, summary: { ...emptyStatusFacts().summary, ...partial.summary } };
}

function v2NoScripts(): ProjectStatusFacts {
  return facts({
    positioningValid: true,
    hasScriptEligiblePlan: true,
    latestPlanStatus: "CONFIRMED",
    latestPlanId: "plan-v2",
    latestPlanTopicCount: 7,
    completedScriptsOnLatestPlan: 0,
    hasCompletedScript: true,
    hasCompletedVideo: true,
    hasPublishedPublication: true,
    hasMetrics: true,
    acceptedVideosOnLatestPlan: 0,
    publishedOnLatestPlan: 0,
    hasMetricsOnLatestPlan: false,
  });
}

function run() {
  const current = v2NoScripts();

  assert.equal(currentCycleWorkflowNavId(current), "scripts");
  assert.equal(isProjectNavItemDone("positioning", current), true);
  assert.equal(isProjectNavItemDone("plans", current), true);
  assert.equal(isProjectNavItemDone("scripts", current), false);
  assert.equal(isProjectNavItemDone("videos", current), false);
  assert.equal(isProjectNavItemDone("publish", current), false);
  assert.equal(isProjectNavItemDone("review", current), false);

  assert.equal(projectWorkflowMark("positioning", false, current), "done");
  assert.equal(projectWorkflowMark("plans", false, current), "done");
  assert.equal(projectWorkflowMark("scripts", false, current), "current");
  assert.equal(projectWorkflowMark("videos", false, current), "todo");
  assert.equal(projectWorkflowMark("publish", false, current), "todo");
  assert.equal(projectWorkflowMark("review", false, current), "todo");

  assert.equal(workflowMarkSymbol(projectWorkflowMark("scripts", false, current)), "●");
  assert.equal(workflowMarkSymbol(projectWorkflowMark("videos", false, current)), "○");
  assert.equal(workflowMarkSymbol(projectWorkflowMark("review", false, current)), "○");
  assert.notEqual(workflowMarkSymbol(projectWorkflowMark("videos", false, current)), "✓");
  assert.notEqual(workflowMarkSymbol(projectWorkflowMark("publish", false, current)), "✓");
  assert.notEqual(workflowMarkSymbol(projectWorkflowMark("review", false, current)), "✓");

  assert.equal(current.hasCompletedVideo, true);
  assert.equal(current.hasPublishedPublication, true);
  assert.equal(current.hasMetrics, true);

  console.log("project-workflow-nav-current-cycle selfcheck PASS");
}

run();

import assert from "node:assert/strict";
import { emptyStatusFacts, type ProjectStatusFacts } from "./project-status";
import { currentWorkStageCopy, cycleProgressRows } from "./ux/cycle-progress";
import { resolveNextActionV2 } from "./ux/next-action-v2";

function facts(partial: Partial<ProjectStatusFacts>): ProjectStatusFacts {
  return { ...emptyStatusFacts(), ...partial, summary: { ...emptyStatusFacts().summary, ...partial.summary } };
}

/** Old cycle completed + current CONFIRMED plan with no scripts. */
function v2NoScripts(): ProjectStatusFacts {
  return facts({
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
    hasReadablePlan: true,
    hasScriptEligiblePlan: true,
    latestPlanStatus: "CONFIRMED",
    latestPlanId: "plan-v2",
    latestPlanTopicCount: 7,
    scriptsOnLatestPlan: 0,
    completedScriptsOnLatestPlan: 0,
    draftScriptsOnLatestPlan: 0,
    hasCompletedScript: true,
    hasCompletedVideo: true,
    acceptedVideoCount: 1,
    hasPublishedPublication: true,
    publishedCount: 1,
    hasMetrics: true,
    acceptedVideosOnLatestPlan: 0,
    publishedOnLatestPlan: 0,
    hasMetricsOnLatestPlan: false,
    recentTopics: [
      { topicId: "t1", title: "选题一", statusLabel: "待生成脚本", href: "/x?topicId=t1" },
      { topicId: "t2", title: "选题二", statusLabel: "待生成脚本", href: "/x?topicId=t2" },
      { topicId: "t3", title: "选题三", statusLabel: "待生成脚本", href: "/x?topicId=t3" },
    ],
  });
}

function run() {
  const current = v2NoScripts();
  const rows = cycleProgressRows(current);
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

  assert.equal(current.latestPlanStatus, "CONFIRMED");
  assert.equal(current.completedScriptsOnLatestPlan, 0);
  assert.equal(byLabel["内容计划"], "7个选题 · 已确认");
  assert.equal(byLabel["脚本"], "0 / 7");
  assert.equal(byLabel["视频"], "0 / 7");
  assert.equal(byLabel["发布"], "0 / 7");
  assert.equal(byLabel["数据复盘"], "尚未开始");

  assert.equal(byLabel["视频"].includes("1"), false);
  assert.notEqual(String(current.acceptedVideoCount), String(current.acceptedVideosOnLatestPlan));
  assert.equal(current.hasPublishedPublication, true);
  assert.equal(current.publishedOnLatestPlan, 0);
  assert.equal(current.hasMetrics, true);
  assert.equal(current.hasMetricsOnLatestPlan, false);

  assert.equal(currentWorkStageCopy("proj-1", current), "内容计划已确认");
  const next = resolveNextActionV2("proj-1", current);
  assert.equal(next.label, "制作第一条脚本");

  assert.equal(current.recentTopics?.length, 3);
  assert.equal(current.hasCompletedVideo, true);
  assert.equal(current.publishedCount, 1);

  console.log("project-overview-current-cycle selfcheck PASS");
}

run();

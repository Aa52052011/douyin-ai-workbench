import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyStatusFacts, type ProjectStatusFacts } from "./project-status";
import { resolveNextActionV2 } from "./ux/next-action-v2";
import { collectProjectTask, continueWorkFor, dedupeTasks, needsAttentionTasks } from "./ux/task-center";
import { currentWorkStageCopy, cycleProgressRows } from "./ux/cycle-progress";
import type { Project } from "./types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const project: Project = {
  id: "p1",
  tenantId: "t",
  workspaceId: "w",
  name: "推广抖音AI智能工作台",
  industry: "AI工具",
  platform: "douyin",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

function facts(partial: Partial<ProjectStatusFacts>): ProjectStatusFacts {
  return { ...emptyStatusFacts(), ...partial, summary: { ...emptyStatusFacts().summary, ...partial.summary } };
}

function foundation(): Partial<ProjectStatusFacts> {
  return {
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
  };
}

function run() {
  const dashboard = read("app/dashboard/page.tsx");
  assert.match(read("components/task-center.tsx"), /bg-\[var\(--acf-brand-soft\)\]/);
  assert.match(read("components/task-center.tsx"), /md:flex-row/);
  assert.match(read("components/task-center.tsx"), /继续处理/);
  assert.match(dashboard, /继续上次工作|ResumeWorkCard/);
  assert.match(dashboard, /需要处理/);
  assert.match(dashboard, /最近项目/);
  assert.match(dashboard, /欢迎使用/);
  assert.match(dashboard, /createProjectSuccessHref/);
  assert.equal(dashboard.includes("tenantId"), false);
  assert.equal(dashboard.includes("workspaceId"), false);

  // 1. 0 projects empty copy
  assert.match(dashboard, /创建第一个项目后/);

  // 2. new project → positioning / 开始账号定位
  const empty = resolveNextActionV2("p1", facts({ productPresent: false }));
  assert.match(empty.href, /\/product/);
  const newWithProduct = resolveNextActionV2("p1", facts({ productPresent: true, positioningValid: false }));
  assert.equal(newWithProduct.label, "开始账号定位");
  assert.match(newWithProduct.href, /\/positioning/);
  assert.equal(currentWorkStageCopy("p1", facts({ productPresent: true, positioningValid: false })), "账号定位");

  // 3. positioning done, no plan
  const noPlan = resolveNextActionV2("p1", facts({ ...foundation(), hasReadablePlan: false }));
  assert.equal(noPlan.label, "生成内容计划");

  // 4. plan confirmed without topic counts → generate script via raw mapping
  const planConfirmed = resolveNextActionV2(
    "p1",
    facts({ ...foundation(), hasReadablePlan: true, hasScriptEligiblePlan: true, latestPlanStatus: "CONFIRMED" }),
  );
  assert.equal(planConfirmed.id, "script");
  assert.match(planConfirmed.href, /\/content\/scripts/);

  // 5. script draft
  const scriptDraft = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      latestPlanStatus: "CONFIRMED",
      hasCompletedScript: false,
      hasDraftScript: true,
    }),
  );
  assert.equal(scriptDraft.label, "确认脚本");

  // 6. video awaiting acceptance — only 待审核视频
  const reviewVideo = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      latestPlanStatus: "CONFIRMED",
      latestPlanTopicCount: 7,
      completedScriptsOnLatestPlan: 7,
      hasCompletedScript: true,
      hasVideo: true,
      hasCompletedVideo: false,
      hasVideoAwaitingAcceptance: true,
      awaitingAcceptanceCount: 1,
    }),
  );
  assert.equal(reviewVideo.label, "待审核视频");
  assert.equal(reviewVideo.ctaLabel, "去审核");
  assert.equal(reviewVideo.href.includes("publish"), false);

  // 7. accepted video, pending publication
  const publish = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      hasCompletedScript: true,
      hasVideo: true,
      hasCompletedVideo: true,
      hasPublishedPublication: false,
    }),
  );
  assert.equal(publish.id, "publication");

  // 8. publication without metrics
  const metrics = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      hasCompletedScript: true,
      hasVideo: true,
      hasCompletedVideo: true,
      hasPublishedPublication: true,
      hasMetrics: false,
    }),
  );
  assert.match(metrics.label, /数据/);

  // 9. metrics exist, cycle complete → next plan, not old AI review hijack
  const loop = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      hasCompletedScript: true,
      hasVideo: true,
      hasCompletedVideo: true,
      hasPublishedPublication: true,
      hasMetrics: true,
    }),
  );
  assert.equal(loop.label, "创建下一期内容");
  assert.match(loop.href, /\/content\/plans/);
  assert.equal(loop.label.includes("AI复盘"), false);

  // 10–11. v2 confirmed plan, v1 scripts/metrics exist → first v2 script
  const v2 = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      latestPlanStatus: "CONFIRMED",
      latestPlanId: "plan-v2",
      latestPlanTopicCount: 7,
      scriptsOnLatestPlan: 0,
      completedScriptsOnLatestPlan: 0,
      draftScriptsOnLatestPlan: 0,
      hasCompletedScript: true,
      hasVideo: true,
      hasCompletedVideo: true,
      hasPublishedPublication: true,
      hasMetrics: true,
    }),
  );
  assert.match(v2.label, /第一条脚本|第 1 条/);
  assert.match(v2.href, /\/content\/scripts/);
  assert.equal(v2.href.includes("/performance"), false);
  assert.equal(v2.href.includes("/publish"), false);
  assert.equal(currentWorkStageCopy("p1", facts({
    ...foundation(),
    latestPlanStatus: "CONFIRMED",
    latestPlanTopicCount: 7,
    completedScriptsOnLatestPlan: 0,
    positioningValid: true,
  })), "内容计划已确认");

  const v2second = resolveNextActionV2(
    "p1",
    facts({
      ...foundation(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: true,
      latestPlanStatus: "CONFIRMED",
      latestPlanId: "plan-v2",
      latestPlanTopicCount: 7,
      completedScriptsOnLatestPlan: 1,
      draftScriptsOnLatestPlan: 0,
      hasCompletedScript: true,
      hasMetrics: true,
    }),
  );
  assert.equal(v2second.label, "继续制作第 2 条脚本");

  // 12. no duplicate tasks per project
  const task = collectProjectTask(project, emptyStatusFacts());
  assert.equal(dedupeTasks([task, { ...task, id: "dup" }]).length, 1);
  assert.equal(needsAttentionTasks([task]).every((item) => item.projectId === project.id), true);
  assert.equal(continueWorkFor([task], "p1")?.href, task.href);
  assert.equal(task.href.includes("/dashboard/projects/p1") && !task.href.endsWith("/p1"), true);

  const rows = cycleProgressRows(facts({ latestPlanStatus: "CONFIRMED", latestPlanTopicCount: 7, completedScriptsOnLatestPlan: 1 }));
  assert.equal(rows.some((item) => item.value.includes("%")), false);
  assert.equal(JSON.stringify(rows).includes("COMPLETED"), false);

  console.log("dashboard-task-center selfcheck PASS");
}

run();

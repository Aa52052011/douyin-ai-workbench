import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV } from "../global-nav";
import { PROJECT_MAIN_NAV } from "../project-nav";
import { emptyStatusFacts } from "../project-status";
import { resolveNextActionV2 } from "./next-action-v2";
import { collectProjectTask, dedupeTasks } from "./task-center";
import { resolveWorkflowStagesV2 } from "./workflow-stages";
import type { Project } from "../types";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

const project: Project = {
  id: "p1",
  tenantId: "t",
  workspaceId: "w",
  name: "Demo",
  industry: "教育",
  platform: "douyin",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function run() {
  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );
  assert.equal(GLOBAL_NAV.some((item) => /Agent|Runs|Artifact|Provider|Execution/.test(item.label)), false);

  const appShell = read("src/components/app-shell.tsx");
  assert.equal(appShell.includes("pathname.includes(\"/dashboard/projects/\") && pathname !== \"/dashboard/projects\"") && appShell.includes("? null"), false);
  assert.match(appShell, /aria-current/);
  assert.match(appShell, /ProjectSwitcher/);

  const projectShell = read("src/components/project-shell.tsx");
  const projectNav = read("src/lib/project-nav.ts");
  assert.match(projectNav, /label: \"账号定位\"/);
  assert.match(projectShell, /PROJECT_MAIN_NAV/);
  assert.equal(PROJECT_MAIN_NAV.some((item) => item.id === "positioning"), true);
  assert.equal(PROJECT_MAIN_NAV.some((item) => String(item.label) === "Agents"), false);

  const dashboard = read("src/app/dashboard/page.tsx");
  assert.match(dashboard, /TaskCenter/);
  assert.equal(dashboard.includes("router.replace"), false);
  assert.match(dashboard, /当前最重要的一步/);

  const a = resolveNextActionV2("p1", emptyStatusFacts());
  const b = resolveNextActionV2("p1", emptyStatusFacts());
  assert.deepEqual(a, b);
  assert.equal(a.label, "完善账号定位");

  const needsReview = resolveNextActionV2("p1", {
    ...emptyStatusFacts(),
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
    hasReadablePlan: true,
    latestPlanStatus: "DRAFT",
    hasScriptEligiblePlan: false,
  });
  assert.equal(needsReview.label, "确认本周内容计划");
  assert.match(needsReview.stepCopy ?? "", /下一步/);

  const withMetrics = resolveNextActionV2("p1", {
    ...emptyStatusFacts(),
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
    hasReadablePlan: true,
    hasScriptEligiblePlan: true,
    hasCompletedScript: true,
    hasVideo: true,
    hasCompletedVideo: true,
    hasPublishedPublication: true,
    hasMetrics: true,
  });
  assert.equal(withMetrics.label, "开始AI复盘");

  const task = collectProjectTask(project, emptyStatusFacts());
  assert.equal(task.title.includes("CONTENT_"), false);
  assert.equal(dedupeTasks([task, { ...task, id: "dup" }]).length, 1);

  const stages = resolveWorkflowStagesV2("p1", emptyStatusFacts());
  assert.equal(stages.length, 8);
  assert.equal(stages[0]?.label, "账号定位");

  const overview = read("src/app/dashboard/projects/[projectId]/page.tsx");
  assert.match(overview, /NextActionCard/);
  assert.match(overview, /WorkflowProgress/);
  assert.match(overview, /ContextReuseSummary/);
  assert.match(read("src/components/publication-data-hub.tsx"), /修改定位/);
  assert.equal(overview.includes("tenantId"), false);
  assert.equal(overview.includes("workspaceId"), false);

  const publish = read("src/app/dashboard/projects/[projectId]/publish/page.tsx");
  assert.match(publish, /PublicationDataHub/);
  assert.match(publish, /手动发布/);
  assert.equal(publish.includes("一键发布到抖音"), false);
  assert.match(publish, /一键发布尚未完成正式验收/);

  const breadcrumb = read("src/components/ui/breadcrumb.tsx");
  assert.match(breadcrumb, /href/);
  assert.match(breadcrumb, /aria-current/);

  assert.match(read("src/app/dashboard/projects/[projectId]/positioning/page.tsx"), /label: \"项目\"/);
  assert.equal(read("src/lib/legacy-debug-routes.ts").includes("/dashboard/agents"), true);
  assert.equal(GLOBAL_NAV.some((item) => item.href.includes("agents")), false);

  console.log("ux-wave2 selfcheck PASS");
}

run();

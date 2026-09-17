import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV } from "./global-nav";
import {
  hideProjectShellNextActionBar,
  isProjectNavItemDone,
  PROJECT_MAIN_NAV,
} from "./project-nav";
import { emptyStatusFacts, type ProjectStatusFacts } from "./project-status";
import { ACCEPTED_ONLY_HANDOFF_COPY } from "./ai-review.workspace";
import { currentCycleWorkflowNavId } from "./ux/current-cycle";
import { resolveAiReviewBackScope, resolveWorkflowBackNav } from "./ux/workflow-back-nav";
import {
  activeGlobalNavIds,
  hasConflictingGlobalPublishActive,
  navScopeMatrix,
} from "./nav-scope";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

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
  const css = read("app/globals.css");
  const appShell = read("components/app-shell.tsx");
  const dialog = read("components/ui/dialog.tsx");
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");
  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  const plans = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  const scripts = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  const videos = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const review = read("app/dashboard/projects/[projectId]/performance/page.tsx");
  const handoff = read("components/feedback-handoff-ux-v5.tsx");
  const projectShell = read("components/project-shell.tsx");
  const card = read("components/recommendation-card-v2.tsx");

  assert.equal(css.includes("overflow-x: clip"), false);
  assert.equal(css.includes("overflow-x:clip"), false);
  assert.equal(appShell.includes("overflow-x-clip"), false);
  assert.equal(appShell.includes("overflow-x: clip"), false);
  assert.doesNotMatch(css, /html\s*\{[^}]*overflow-x:\s*clip/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*clip/);

  const cycle = v2NoScripts();
  assert.equal(currentCycleWorkflowNavId(cycle), "scripts");
  assert.equal(isProjectNavItemDone("scripts", cycle), false);
  assert.equal(isProjectNavItemDone("videos", cycle), false);
  assert.equal(isProjectNavItemDone("publish", cycle), false);
  assert.equal(isProjectNavItemDone("review", cycle), false);
  assert.equal(PROJECT_MAIN_NAV.map((item) => item.label).join(","), "项目概览,账号定位,内容计划,选题与脚本,视频制作,发布与数据,AI复盘");

  const pid = "proj-audit";
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/positioning`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/content/plans`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/content/scripts`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/content/videos`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/publish`, pid), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}/performance`, pid), true);

  assert.equal(overview.includes("NextActionBarV1"), false);
  assert.match(overview, /NextActionCard/);
  assert.equal((positioning.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((plans.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((scripts.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((videos.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((publish.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((review.match(/<NextActionBarV1/g) ?? []).length, 1);
  assert.equal((projectShell.match(/<NextActionBarV1/g) ?? []).length, 1);

  const reviewBar = review.slice(review.lastIndexOf("<NextActionBarV1"));
  assert.equal(reviewBar.includes("开始下一轮内容规划"), false);
  assert.match(review, /nextLabel="开始下一轮内容规划"/);
  assert.match(videos, /nextHref=\{scriptId \? flow\.next\?\.href : undefined\}/);

  for (const source of [overview, positioning, plans, scripts, videos, publish, review]) {
    assert.equal(source.includes(">USER_ASSERTED<"), false);
    assert.equal(source.includes(">HIGH_"), false);
    assert.equal(source.includes(">SPARSE<"), false);
    assert.equal(source.includes(">COMPLETED<"), false);
    assert.equal(source.includes("router.back("), false);
  }
  assert.equal(publish.includes("一键发布"), false);

  assert.match(dialog, /if \(!isOpen\) return null/);
  assert.equal(dialog.includes("inert"), false);
  assert.equal(dialog.includes("document.body.style"), false);

  assert.match(handoff, /ACCEPTED_ONLY_HANDOFF_COPY/);
  assert.match(ACCEPTED_ONLY_HANDOFF_COPY, /已采纳/);
  assert.equal(handoff.includes("已自动应用"), false);

  assert.equal(GLOBAL_NAV.map((item) => item.label).join(","), "工作台,项目,发布与数据,设置");
  assert.equal(resolveWorkflowBackNav({ page: "publish", projectId: pid }).href, `/dashboard/projects/${pid}/content/videos`);
  assert.equal(resolveWorkflowBackNav({ page: "ai-review", projectId: pid, publicationId: "pub-1" }).href, `/dashboard/projects/${pid}/publish`);
  assert.equal(resolveAiReviewBackScope({ projectId: pid }), "PROJECT_SCOPED_AI_REVIEW");
  assert.equal(resolveAiReviewBackScope({}), "GLOBAL_MONITORING_CONTEXT");
  assert.equal(GLOBAL_NAV.find((item) => item.id === "publish-data")?.match(`/dashboard/projects/${pid}/publish`), false);
  assert.equal(GLOBAL_NAV.find((item) => item.id === "publish-data")?.match(`/dashboard/projects/${pid}/performance`), false);
  assert.equal(GLOBAL_NAV.find((item) => item.id === "publish-data")?.match("/dashboard/monitoring"), true);
  assert.deepEqual(activeGlobalNavIds(`/dashboard/projects/${pid}/publish`), ["projects"]);
  assert.equal(hasConflictingGlobalPublishActive(`/dashboard/projects/${pid}/publish`), false);
  assert.equal(hasConflictingGlobalPublishActive(`/dashboard/projects/${pid}/performance`), false);
  const matrix = navScopeMatrix(pid);
  for (const row of matrix) {
    if (row.route.startsWith(`/dashboard/projects/${pid}`)) {
      assert.equal(row.globalActive.includes("publish-data"), false);
      assert.equal(row.globalActive.includes("projects"), true);
    }
  }
  assert.equal(matrix.find((row) => row.route === `/dashboard/projects/${pid}/performance`)?.backTarget, `/dashboard/projects/${pid}/publish`);
  assert.equal(matrix.find((row) => row.route === "/dashboard/monitoring")?.globalActive.includes("publish-data"), true);
  assert.equal(matrix.find((row) => row.route === "/dashboard/monitoring")?.globalActive.includes("projects"), false);
  assert.match(publish, /currentCyclePublication/);
  assert.match(card, /variant="secondary"/);

  console.log("final-ui-regression selfcheck PASS");
}

run();

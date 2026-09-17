import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV } from "./global-nav";
import { adjacentProjectNav, PROJECT_NAV, projectWorkflowMark } from "./project-nav";
import { emptyStatusFacts } from "./project-status";
import { getStatusTone, getUserFacingStatus } from "./ui-labels";
import { SPACING_SCALE } from "./ux/tokens";
import { resolveWorkflowBackNav } from "./ux/workflow-back-nav";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  assert.deepEqual([...SPACING_SCALE], [4, 8, 12, 16, 24, 32, 48, 64]);
  const css = read("app/globals.css");
  assert.match(css, /--acf-radius-sm:\s*8px/);
  assert.match(css, /--acf-radius-md:\s*12px/);
  assert.match(css, /--acf-app-max/);
  assert.match(css, /--acf-form-max/);
  assert.match(css, /prefers-reduced-motion/);
  assert.equal(css.includes("linear-gradient"), false);
  assert.equal(css.includes("glass"), false);

  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );
  assert.equal(PROJECT_NAV.length, 7);
  assert.equal(PROJECT_NAV.at(-1)?.label, "AI复盘");

  assert.equal(getUserFacingStatus("PENDING"), "等待处理");
  assert.equal(getUserFacingStatus("RUNNING"), "正在处理");
  assert.equal(getUserFacingStatus("COMPLETED"), "已完成");
  assert.equal(getUserFacingStatus("FAILED"), "处理失败");
  assert.equal(getUserFacingStatus("DRAFT"), "草稿");
  assert.equal(getUserFacingStatus("CONFIRMED"), "已确认");
  assert.equal(getUserFacingStatus("ACCEPTED"), "已采纳");
  assert.equal(getUserFacingStatus("REJECTED"), "不采纳");
  assert.equal(getUserFacingStatus("DEFERRED"), "稍后再看");
  assert.equal(getUserFacingStatus("USER_ASSERTED"), "用户已登记");
  assert.equal(getUserFacingStatus("UNKNOWN_CODE"), "处理中");
  assert.equal(getStatusTone("ACCEPTED"), "success");
  assert.equal(getStatusTone("DEFERRED"), "warning");

  const facts = emptyStatusFacts();
  assert.equal(projectWorkflowMark("positioning", false, facts), "current");
  assert.equal(projectWorkflowMark("positioning", true, facts), "current");
  assert.equal(projectWorkflowMark("plans", false, facts), "todo");
  assert.equal(projectWorkflowMark("positioning", false, { ...facts, positioningValid: true }), "done");

  const project = "proj_1";
  const flow = adjacentProjectNav(`/dashboard/projects/${project}/content/scripts`, project);
  assert.equal(flow.back?.href, `/dashboard/projects/${project}/content/plans`);
  assert.equal(flow.next?.href, `/dashboard/projects/${project}/content/videos`);

  assert.equal(resolveWorkflowBackNav({ page: "script", projectId: project }).href.includes("content/plans"), true);
  const backNav = read("components/workflow-back-nav-v1.tsx");
  assert.equal(backNav.includes("router.back"), false);

  const shell = read("components/app-shell.tsx");
  assert.match(shell, /data-acf-app-shell-v2/);
  assert.match(shell, /aria-current/);
  assert.equal(shell.includes("12345"), false);
  assert.match(read("components/project-switcher.tsx"), /全部项目/);
  assert.equal(read("components/project-switcher.tsx").includes(">全部<"), false);
  assert.match(read("components/project-shell.tsx"), /data-acf-project-compact-header-v1/);
  assert.match(read("components/project-shell.tsx"), /data-acf-project-workflow-nav-v2/);
  assert.equal(read("components/project-shell.tsx").includes("project.description"), false);
  assert.match(read("components/next-action-bar-v1.tsx"), /data-acf-next-action-bar-v1/);
  assert.match(read("components/page-container-v2.tsx"), /acf-page-container/);
  assert.match(read("components/technical-details-panel.tsx"), /技术详情/);
  assert.match(read("components/inline-action-error-v1.tsx"), /data-acf-inline-action-error/);
  assert.match(read("components/async-task-progress-v1.tsx"), /data-acf-async-task-progress/);
  assert.match(read("components/ui/button.tsx"), /处理中/);
  assert.match(read("components/ui/card.tsx"), /variant = "standard"/);
  assert.match(read("app/dashboard/layout.tsx"), /AppShell/);
  assert.equal(read("app/login/page.tsx").includes("ProjectShell"), false);
  assert.equal(read("app/dashboard/settings/page.tsx").includes("ProjectWorkflow"), false);
  assert.equal(read("app/dashboard/monitoring/page.tsx").includes("ProjectShell"), false);

  console.log("phase-a app-shell selfcheck PASS");
}

run();

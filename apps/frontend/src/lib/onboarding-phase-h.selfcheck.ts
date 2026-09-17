import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_WORKFLOW_OVERVIEW,
  FIRST_RUN_PRODUCT_STEPS,
  FIRST_RUN_STEPS,
  ONBOARDING_PERSISTENCE,
  shouldShowFirstRunOnboarding,
  CONTEXTUAL_GUIDANCE,
  POSITIONING_FIRST_STEP_COPY,
  positioningFirstStepStorageKey,
} from "./ux/onboarding-v1";
import { createProjectSuccessHref } from "./ux/create-project-flow";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  assert.equal(ONBOARDING_PERSISTENCE, "LOCAL");
  assert.equal(FIRST_RUN_STEPS.length, 4);
  assert.equal(FIRST_RUN_PRODUCT_STEPS.length, 3);
  assert.equal(CONTENT_WORKFLOW_OVERVIEW.length, 7);
  assert.equal(shouldShowFirstRunOnboarding(false, false), true);
  assert.equal(shouldShowFirstRunOnboarding(true, false), false);
  assert.equal(shouldShowFirstRunOnboarding(false, true), false);
  assert.equal(shouldShowFirstRunOnboarding(true, true), false);
  assert.equal(createProjectSuccessHref("abc"), "/dashboard/projects/abc/positioning");
  assert.equal(positioningFirstStepStorageKey("p1").includes("p1"), true);

  const firstRun = read("components/first-run-onboarding-v1.tsx");
  assert.match(firstRun, /shouldShowFirstRunOnboarding/);
  assert.match(firstRun, /创建第一个项目/);
  assert.match(firstRun, /了解工作流程/);
  assert.match(firstRun, /WorkflowOverviewDialog/);
  assert.match(firstRun, /不会一次介绍全部功能/);
  assert.match(firstRun, /FIRST_RUN_PRODUCT_STEPS/);

  const dashboard = read("app/dashboard/page.tsx");
  assert.match(dashboard, /FirstRunOnboardingV1 hasProjects=\{projectCount > 0\}/);
  assert.match(dashboard, /ResumeWorkCard/);
  assert.match(dashboard, /createProjectSuccessHref/);
  assert.match(dashboard, /xl:grid-cols-2/);

  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  assert.match(positioning, /PositioningFirstStepNotice/);
  assert.match(positioning, /第一步：确认账号定位|PositioningFirstStepNotice/);
  assert.equal(POSITIONING_FIRST_STEP_COPY.title, "第一步：确认账号定位");

  const notice = read("components/positioning-first-step-notice.tsx");
  assert.match(notice, /知道了/);
  assert.match(notice, /positioningFirstStepStorageKey/);

  const workflow = read("components/workflow-overview-dialog.tsx");
  assert.match(workflow, /你的内容工作流/);
  assert.equal(workflow.includes("AgentRun"), false);
  assert.equal(workflow.includes("HIGH_"), false);

  assert.equal(CONTEXTUAL_GUIDANCE.positioning.body.includes("后续计划和脚本会自动复用"), true);
  assert.match(CONTEXTUAL_GUIDANCE.planning.title, /摘要/);
  assert.match(CONTEXTUAL_GUIDANCE.script.title, /确认后再制作视频/);
  assert.match(CONTEXTUAL_GUIDANCE.video.title, /确认最终成片/);
  assert.match(CONTEXTUAL_GUIDANCE.publish.title, /手动发布/);
  assert.match(CONTEXTUAL_GUIDANCE.analysis.title, /不会自动应用/);

  console.log("onboarding-phase-h selfcheck PASS");
}

run();

import assert from "node:assert/strict";
import { GLOBAL_NAV, HIDDEN_ENGINEERING_NAV_LABELS } from "./global-nav";
import { isProjectNavActive, PROJECT_NAV } from "./project-nav";
import { emptyStatusFacts, getProjectNextAction } from "./project-next-action";
import { statusLabel } from "./status-label";

const projectId = "proj_1";

function flattenNavHrefs(id: string): string[] {
  return PROJECT_NAV.map((item) => item.href(id));
}

function run() {
  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );
  const visibleLabels = GLOBAL_NAV.map((item) => item.label as string);
  for (const label of HIDDEN_ENGINEERING_NAV_LABELS) {
    assert.equal(visibleLabels.includes(label), false, `${label} must stay hidden`);
  }
  assert.equal(GLOBAL_NAV[0].match("/dashboard"), true);
  assert.equal(GLOBAL_NAV[0].match("/dashboard/projects"), false);
  assert.equal(GLOBAL_NAV[1].match("/dashboard/projects/abc"), true);
  assert.equal(GLOBAL_NAV[2].match("/dashboard/monitoring"), true);
  assert.equal(GLOBAL_NAV[3].match("/dashboard/settings"), true);

  const hrefs = flattenNavHrefs(projectId);
  assert.deepEqual(hrefs, [
    `/dashboard/projects/${projectId}`,
    `/dashboard/projects/${projectId}/positioning`,
    `/dashboard/projects/${projectId}/content/plans`,
    `/dashboard/projects/${projectId}/content/scripts`,
    `/dashboard/projects/${projectId}/content/videos`,
    `/dashboard/projects/${projectId}/publish`,
  ]);
  assert.equal(PROJECT_NAV.length, 6);
  assert.equal(PROJECT_NAV.some((item) => String(item.label) === "Agents" || String(item.label).includes("Agent")), false);
  assert.equal(isProjectNavActive(`/dashboard/projects/${projectId}`, `/dashboard/projects/${projectId}`, true), true);
  assert.equal(isProjectNavActive(`/dashboard/projects/${projectId}/product`, `/dashboard/projects/${projectId}`, true), false);
  assert.equal(
    isProjectNavActive(`/dashboard/projects/${projectId}/market/research`, `/dashboard/projects/${projectId}/market/research`),
    true,
  );

  const empty = emptyStatusFacts();
  assert.equal(getProjectNextAction(projectId, empty).label, "开始填写产品信息");
  assert.equal(getProjectNextAction(projectId, { ...empty, productPresent: true }).label, "生成账号定位");
  assert.equal(
    getProjectNextAction(projectId, { ...empty, productPresent: true, positioningValid: true, researchPresent: true }).label,
    "开始市场分析",
  );
  assert.equal(
    getProjectNextAction(projectId, {
      ...empty,
      productPresent: true,
      positioningValid: true,
      researchPresent: true,
      insightPresent: true,
    }).label,
    "生成推广策略",
  );
  assert.equal(
    getProjectNextAction(projectId, {
      ...empty,
      productPresent: true,
      positioningValid: true,
      researchPresent: true,
      insightPresent: true,
      strategyUsable: true,
    }).label,
    "创建内容计划",
  );

  assert.equal(statusLabel("PENDING"), "等待中");
  assert.equal(statusLabel("RUNNING"), "生成中");
  assert.equal(statusLabel("PROCESSING"), "生成中");
  assert.equal(statusLabel("COMPLETED"), "已完成");
  assert.equal(statusLabel("FAILED"), "失败");
  assert.equal(statusLabel("READY"), "可使用");
  assert.equal(statusLabel("DRAFT"), "草稿");
  assert.equal(statusLabel("CONFIRMED"), "已确认");
  assert.equal(statusLabel("ARCHIVED"), "已归档");
  assert.equal(statusLabel("PUBLISHED"), "已发布");
  assert.equal(statusLabel("UNKNOWN_EXTERNAL_STATE"), "发布状态待确认");

  assert.equal("/dashboard/settings".startsWith("/dashboard/settings"), true);
  assert.equal("/dashboard/agents".includes("agents"), true);

  console.log("product-shell selfcheck PASS");
}

run();

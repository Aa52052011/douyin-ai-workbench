import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { positioningSourceLabel } from "./ux/positioning-source";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  assert.match(positioning, /还没有账号定位/);
  assert.match(positioning, /开始定位/);
  assert.match(positioning, /AsyncTaskProgressV1/);
  assert.match(positioning, /确认定位并继续/);
  assert.match(positioning, /继续到内容计划/);
  assert.match(positioning, /✓ 账号定位已确认/);
  assert.match(positioning, /showOnboardingGuidance/);
  assert.match(positioning, /data-acf-positioning-secondary-actions/);
  assert.match(positioning, /data-acf-positioning-flow-nav/);
  assert.match(positioning, /InlineActionErrorV1/);
  assert.equal(positioning.includes("sourceAgentRunId"), false);
  assert.equal(positioning.includes("CONFIRMED"), false);

  assert.equal(positioningSourceLabel("user"), "你填写");
  assert.equal(positioningSourceLabel("reuse"), "已从项目资料复用");
  assert.equal(positioningSourceLabel("ai"), "AI 已整理");
  assert.equal(positioningSourceLabel("suggest"), "AI 建议");

  const summary = read("components/positioning-summary.tsx");
  assert.match(summary, /账号定位/);
  assert.match(summary, /目标用户/);
  assert.match(summary, /核心目标/);
  assert.match(summary, /内容风格/);
  assert.match(summary, /更多设置/);
  assert.match(summary, /编辑/);
  assert.match(summary, /items-start/);
  assert.match(summary, /self-start/);
  assert.match(summary, /补充要求/);
  assert.match(summary, /特殊限制/);
  assert.equal(summary.includes("open="), false);
  assert.equal(summary.includes("project.description"), false);

  console.log("positioning-productization selfcheck PASS");
}

run();

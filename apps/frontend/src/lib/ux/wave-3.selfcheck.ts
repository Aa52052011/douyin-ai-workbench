import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyUserEdit, createFieldState, receiveExternalValue } from "./field-source";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  const positioning = read("src/app/dashboard/projects/[projectId]/positioning/page.tsx");
  assert.match(positioning, /生成内容计划/);
  assert.match(positioning, /确认定位并继续/);
  assert.match(positioning, /ProductionContextHeaderV3/);
  assert.equal(positioning.includes("下一步：导入市场数据"), false);

  const form = read("src/components/positioning-form.tsx");
  assert.match(form, /SmartFormField/);
  assert.match(form, /你的内容主要给谁看/);
  assert.match(form, /更多设置/);
  assert.match(form, /SelectWithCustomInput/);
  assert.match(form, /applyUserEdit/);
  assert.match(form, /receiveExternalValue/);

  const planning = read("src/app/dashboard/projects/[projectId]/content/plans/page.tsx");
  assert.match(planning, /确认内容计划/);
  assert.match(planning, /为这个选题生成脚本/);
  assert.match(planning, /data-acf-planning-reused-positioning|positioningSummary/);

  const planningForm = read("src/components/content-planning-form.tsx");
  assert.match(planningForm, /已使用账号定位/);
  assert.equal(planningForm.includes("请填写行业"), false);

  const topics = read("src/components/content-planning-topics.tsx");
  assert.match(topics, /TopicCardV3/);
  assert.equal(topics.includes("sourceAgentRunId"), false);
  assert.doesNotMatch(topics, /选题 ID/);

  const scripts = read("src/app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  assert.match(scripts, /HumanReviewBar/);
  assert.match(scripts, /开始制作视频/);
  assert.match(scripts, /data-acf-script-context-reuse|contextLine/);
  assert.match(scripts, /生成新版本/);

  const source = read("src/components/script-source-form.tsx");
  assert.match(source, /特殊要求/);
  assert.equal(source.includes("行业"), false);
  assert.equal(source.includes("目标平台"), false);

  const detail = read("src/components/script-detail.tsx");
  assert.match(detail, /希望观众下一步做什么/);
  assert.equal(detail.includes("label=\"CTA\""), false);

  const prefilled = createFieldState("A", "AI_PREFILLED");
  const overridden = applyUserEdit(prefilled, "B");
  const afterSuggest = receiveExternalValue(overridden, "C", "AI_SUGGESTED");
  assert.equal(overridden.value, "B");
  assert.equal(afterSuggest.value, "B");
  assert.equal(afterSuggest.pendingSuggestion, "C");

  assert.match(read("src/lib/positioning.form.ts"), /contentPlansHref/);
  console.log("ux-wave3 selfcheck PASS");
}

run();

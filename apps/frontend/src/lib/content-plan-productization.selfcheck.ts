import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectDisplayPlan } from "./content-planning.form";
import { resolveTopicUserFacingV2 } from "./content-planning.production";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  assert.match(page, /LearningContextSummaryV1/);
  assert.match(page, /开始制作第一条脚本/);
  assert.match(page, /data-acf-plan-workspace/);
  assert.match(page, /本周内容/);
  assert.match(page, /data-acf-plan-secondary/);
  assert.match(page, /data-acf-planning-more-index/);
  assert.match(page, /已进入制作/);
  assert.equal(page.includes("ContentPlanningWeekOverview"), false);
  assert.equal(page.includes("ContentPlanningCurrentFocus"), false);
  assert.equal(page.includes("现在先做这一条"), false);
  assert.equal((page.match(/开始制作第一条脚本/g) || []).length, 1);
  assert.ok(page.indexOf("data-acf-plan-header") < page.indexOf("<ContentPlanningTopics"));
  assert.ok(page.indexOf("开始制作第一条脚本") < page.indexOf("<ContentPlanningTopics"));
  assert.match(page, /确认内容计划/);
  assert.match(page, /正在确认/);
  assert.match(page, /生成内容计划/);
  assert.match(page, /还没有内容计划/);
  assert.equal(page.includes("createScript"), false);
  assert.equal(page.includes("generateScript"), false);
  assert.equal(/confirm\(\)[\s\S]*listScripts/.test(page), false);

  const none = selectDisplayPlan([]);
  assert.equal(none.display, null);

  const draft = selectDisplayPlan([{ id: "d", version: 1, status: "DRAFT", createdAt: "2026-01-01T00:00:00.000Z" }]);
  assert.equal(draft.display?.id, "d");
  assert.equal(draft.draftPriority, false);

  const confirmed = selectDisplayPlan([{ id: "c", version: 1, status: "CONFIRMED", createdAt: "2026-01-01T00:00:00.000Z" }]);
  assert.equal(confirmed.display?.id, "c");

  const v1v2 = selectDisplayPlan([
    { id: "v1", version: 1, status: "CONFIRMED", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "v2", version: 2, status: "CONFIRMED", createdAt: "2026-01-02T00:00:00.000Z" },
  ]);
  assert.equal(v1v2.display?.id, "v2");

  const oldPlusDraft = selectDisplayPlan([
    { id: "v2", version: 2, status: "CONFIRMED", createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "v3", version: 3, status: "DRAFT", createdAt: "2026-01-03T00:00:00.000Z" },
  ]);
  assert.equal(oldPlusDraft.display?.id, "v3");
  assert.equal(oldPlusDraft.draftPriority, true);

  const item = {
    topicId: "t1",
    topicIndex: 0,
    dayIndex: 1,
    dayLabel: "第 1 条",
    sequenceLabel: "第 1 条",
    title: "选题",
    status: "NOT_STARTED" as const,
    statusLabel: "待制作",
  };
  const noScript = resolveTopicUserFacingV2({
    projectId: "p",
    planId: "plan-v2",
    planConfirmed: true,
    item,
    scripts: [],
    videos: [],
  });
  assert.equal(noScript.label, "待制作脚本");
  assert.match(noScript.href ?? "", /content\/scripts/);
  assert.match(noScript.href ?? "", /topicId=t1/);

  const draftScript = resolveTopicUserFacingV2({
    projectId: "p",
    planId: "plan-v2",
    planConfirmed: true,
    item,
    scripts: [{ id: "s1", contentPlanId: "plan-v2", topicId: "t1", version: 1, status: "DRAFT", createdAt: "2026-01-01T00:00:00.000Z" }],
    videos: [],
  });
  assert.equal(draftScript.label, "脚本待确认");

  const topics = read("components/content-planning-topics.tsx");
  assert.match(topics, /TopicCardV3/);
  assert.match(topics, /TopicDetailDrawerV1/);
  assert.match(topics, /查看详情/);
  assert.equal(topics.includes("sourceAgentRunId"), false);
  assert.doesNotMatch(topics, /选题 ID/);
  assert.equal(topics.includes("payload"), false);

  const history = read("components/content-planning-history.tsx");
  assert.match(history, /VersionHistoryDrawerV1/);
  assert.match(history, /只读/);
  assert.equal(history.includes("canScript={true}"), false);

  const learning = read("components/learning-context-summary-v1.tsx");
  assert.match(learning, /上一轮已采纳建议/);
  assert.match(learning, /本轮不参考上一轮已采纳建议/);
  assert.match(learning, /ignore/);
  assert.match(learning, /查看参考依据/);
  assert.match(learning, /不会自动修改定位或推广目标/);

  const notice = read("components/planning-accepted-feedback-notice.tsx");
  assert.match(notice, /本轮不参考这些建议/);

  console.log("content-plan-productization selfcheck PASS");
}

run();

import assert from "node:assert/strict";
import {
  DEFAULT_CONTENT_BATCH_SIZE,
  deriveBatchSize,
  displaySequenceNumber,
  formatTopicSequenceLabel,
  planningPageSubtitle,
  planningPageTitle,
  regenerateBatchLabel,
  toContentBatchView,
  weekOverviewHeading,
} from "./content-batch";
import type { ContentPlanRecord } from "./content-planning.types";

function plan(topics: Array<{ id: string; dayIndex: number; title: string }>, extra?: Partial<ContentPlanRecord>): ContentPlanRecord {
  return {
    id: "plan-1",
    projectId: "p1",
    title: "测试批次",
    description: null,
    status: "CONFIRMED",
    version: 1,
    payload: {
      title: "测试批次",
      summary: "s",
      planningDays: 7,
      postsPerDay: 1,
      topics,
    },
    planningDays: 7,
    postsPerDay: 1,
    platform: "douyin",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const seven = Array.from({ length: 7 }, (_, i) => ({
  id: `t${i + 1}`,
  dayIndex: i + 1,
  title: `选题${i + 1}`,
}));
const view7 = toContentBatchView(plan(seven));
assert.ok(view7);
assert.equal(view7!.batchSize, 7);
assert.equal(deriveBatchSize(7), 7);
assert.equal(planningPageTitle(), "本期内容计划");

const fourteen = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  dayIndex: Math.floor(i / 2) + 1,
  title: `选题${i + 1}`,
}));
const view14 = toContentBatchView(
  plan(fourteen, {
    planningDays: 7,
    postsPerDay: 2,
    payload: { title: "双轨", planningDays: 7, postsPerDay: 2, topics: fourteen },
  }),
);
assert.equal(view14!.batchSize, 14);

// Mixed: planningDays×postsPerDay ≠ topics.length → authority = topics.length
const thirteen = Array.from({ length: 13 }, (_, i) => ({
  id: `t${i + 1}`,
  dayIndex: i + 1,
  title: `选题${i + 1}`,
}));
const view13 = toContentBatchView(
  plan(thirteen, {
    planningDays: 7,
    postsPerDay: 2,
    payload: { title: "混合", planningDays: 7, postsPerDay: 2, topics: thirteen },
  }),
);
assert.equal(view13!.batchSize, 13);

assert.equal(displaySequenceNumber(1, 0), 1);
assert.equal(formatTopicSequenceLabel(3), "第 3 条");
assert.equal(formatTopicSequenceLabel(2, 1, 2), "第 2 条 · 1/2");
assert.equal(planningPageTitle(), "本期内容计划");
assert.equal(planningPageSubtitle(7), "本批共 7 条内容");
assert.equal(planningPageSubtitle(14), "本批共 14 条内容");
assert.equal(weekOverviewHeading().includes("7 天"), false);
assert.equal(regenerateBatchLabel().includes("本周"), false);
assert.equal(DEFAULT_CONTENT_BATCH_SIZE, 7);
assert.equal(view7!.schedulePreferenceLegacy, true);

console.log("content-batch selfcheck PASS");

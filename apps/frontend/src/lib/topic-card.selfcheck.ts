import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTopicUserFacingV2 } from "./content-planning.production";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const topics = readFileSync(path.join(root, "components/content-planning-topics.tsx"), "utf8");
assert.match(topics, /TopicCardV3/);
assert.match(topics, /查看详情/);
assert.match(topics, /核心角度/);
assert.match(topics, /line-clamp-2/);
assert.match(topics, /制作脚本 →/);
assert.match(topics, /当前优先/);
assert.match(topics, /data-acf-topic-row/);
assert.match(topics, /data-acf-topic-priority/);
assert.equal(topics.includes("UUID"), false);

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
assert.equal(
  resolveTopicUserFacingV2({ projectId: "p", planId: "plan", planConfirmed: true, item, scripts: [], videos: [] }).label,
  "待制作脚本",
);
console.log("topic-card selfcheck PASS");

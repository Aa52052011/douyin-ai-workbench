/**
 * Step 12.12O — production derivation selfcheck
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTopicProductionItems,
  displayDayNumber,
  findNextProductionAction,
  getCurrentProductionTopic,
  latestConfirmedPlan,
  latestDraftPlan,
  orderPlanTopics,
  summarizeProductionProgress,
  topicProductionStatusLabel,
} from "./content-planning.production";
import type { ContentPlanRecord } from "./content-planning.types";
import type { PublicationRecord } from "./publication.types";
import type { ScriptRecord } from "./script.types";
import type { VideoRecord } from "./video.types";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = join(here, "..");

function plan(partial: Partial<ContentPlanRecord> & { id: string; topics: Array<Record<string, unknown>> }): ContentPlanRecord {
  return {
    id: partial.id,
    status: partial.status ?? "CONFIRMED",
    version: partial.version ?? 1,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    planningDays: 7,
    postsPerDay: 1,
    payload: {
      title: "测试计划",
      summary: "摘要",
      planningDays: 7,
      postsPerDay: 1,
      topics: partial.topics,
    },
  };
}

function sevenTopics() {
  return Array.from({ length: 7 }, (_, i) => ({
    id: `t${i + 1}`,
    dayIndex: i + 1,
    title: `选题 ${i + 1}`,
    hook: `hook-${i + 1}`,
    contentAngle: `angle-${i + 1}`,
    reason: `reason-${i + 1}`,
    status: "planned",
  }));
}

function run() {
  assert.equal(displayDayNumber(1, 0), 1);
  assert.equal(displayDayNumber(0, 0), 1);
  assert.equal(topicProductionStatusLabel("NOT_STARTED"), "待制作");
  assert.equal(topicProductionStatusLabel("PUBLISHED"), "已发布");

  const topics = sevenTopics();
  const basePlan = plan({ id: "plan-1", topics });

  // CASE 1
  let items = buildTopicProductionItems({ plan: basePlan, scripts: [], videos: [], publications: [] });
  assert.equal(items.length, 7);
  assert.equal(getCurrentProductionTopic(items)?.topicId, "t1");
  assert.equal(findNextProductionAction(items).kind, "SCRIPT");

  // CASE 2
  const scripts: ScriptRecord[] = [
    {
      id: "s1",
      contentPlanId: "plan-1",
      topicId: "t1",
      version: 1,
      status: "CONFIRMED",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  items = buildTopicProductionItems({ plan: basePlan, scripts, videos: [], publications: [] });
  assert.equal(items[0].status, "SCRIPT_READY");
  assert.equal(getCurrentProductionTopic(items)?.topicId, "t2");

  // CASE 3
  scripts.push({
    id: "s2",
    contentPlanId: "plan-1",
    topicId: "t2",
    version: 1,
    status: "CONFIRMED",
    createdAt: "2026-01-03T00:00:00.000Z",
  });
  items = buildTopicProductionItems({ plan: basePlan, scripts, videos: [], publications: [] });
  assert.equal(getCurrentProductionTopic(items)?.topicId, "t3");

  // CASE 4 draft script not ready
  items = buildTopicProductionItems({
    plan: basePlan,
    scripts: [
      {
        id: "s-draft",
        contentPlanId: "plan-1",
        topicId: "t1",
        version: 1,
        status: "DRAFT",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    videos: [],
    publications: [],
  });
  assert.equal(items[0].status, "NOT_STARTED");

  // CASE 5 confirmed script ready
  items = buildTopicProductionItems({ plan: basePlan, scripts: [scripts[0]], videos: [], publications: [] });
  assert.equal(items[0].status, "SCRIPT_READY");

  // CASE 6 video completed
  const videos: VideoRecord[] = [
    {
      id: "v1",
      scriptId: "s1",
      status: "COMPLETED",
      createdAt: "2026-01-04T00:00:00.000Z",
    },
  ];
  items = buildTopicProductionItems({ plan: basePlan, scripts: [scripts[0]], videos, publications: [] });
  assert.equal(items[0].status, "VIDEO_READY");

  // CASE 7 published
  const publications: PublicationRecord[] = [
    {
      id: "p1",
      videoId: "v1",
      status: "PUBLISHED",
      createdAt: "2026-01-05T00:00:00.000Z",
    },
  ];
  items = buildTopicProductionItems({ plan: basePlan, scripts: [scripts[0]], videos, publications });
  assert.equal(items[0].status, "PUBLISHED");

  // CASE 8 draft plan does not override confirmed
  const plans = [
    plan({ id: "plan-1", version: 1, status: "CONFIRMED", topics }),
    plan({ id: "plan-2", version: 2, status: "DRAFT", topics: sevenTopics() }),
  ];
  assert.equal(latestConfirmedPlan(plans)?.id, "plan-1");
  assert.equal(latestDraftPlan(plans)?.id, "plan-2");

  // CASE 9 v2 confirmed becomes current
  plans[1] = plan({ id: "plan-2", version: 2, status: "CONFIRMED", topics: sevenTopics() });
  assert.equal(latestConfirmedPlan(plans)?.id, "plan-2");

  // CASE 10 ordering ignores priority
  const disordered = orderPlanTopics([
    { id: "b", dayIndex: 2, title: "B", priority: "high" },
    { id: "a", dayIndex: 1, title: "A", priority: "low" },
  ]);
  assert.equal(disordered[0].id, "a");

  const progress = summarizeProductionProgress(
    buildTopicProductionItems({
      plan: basePlan,
      scripts: [scripts[0], scripts[1]],
      videos,
      publications,
    }),
  );
  assert.equal(progress.topicCount, 7);
  assert.equal(progress.publishedCount, 1);
  assert.match(progress.summaryLabel, /已进入制作/);

  // Partial execution → Day3 current
  items = buildTopicProductionItems({
    plan: basePlan,
    scripts: [scripts[0], scripts[1]],
    videos,
    publications,
  });
  assert.equal(items[0].status, "PUBLISHED");
  assert.equal(items[1].status, "SCRIPT_READY");
  assert.equal(getCurrentProductionTopic(items)?.topicId, "t3");

  // All scripts done → next video action
  const allScriptReady: ScriptRecord[] = sevenTopics().map((t, i) => ({
    id: `sx${i + 1}`,
    contentPlanId: "plan-1",
    topicId: t.id as string,
    version: 1,
    status: "CONFIRMED",
    createdAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
  }));
  items = buildTopicProductionItems({ plan: basePlan, scripts: allScriptReady, videos: [], publications: [] });
  assert.equal(getCurrentProductionTopic(items), null);
  const next = findNextProductionAction(items);
  assert.equal(next.kind, "VIDEO");
  assert.equal(next.kind === "VIDEO" ? next.topic.topicId : "", "t1");

  const page = readFileSync(join(frontendSrc, "app/dashboard/projects/[projectId]/content/plans/page.tsx"), "utf8");
  assert.match(page, /已进入制作/);
  assert.match(page, /data-acf-planning-more-index/);
  assert.match(page, /为什么这样规划/);
  assert.match(page, /重新规划本周内容/);
  assert.match(page, /确认本期内容规划|确认新规划|确认内容计划/);
  assert.equal(page.includes("ContentPlanningTopics"), true);
  assert.equal(page.includes("ContentPlanningWeekOverview"), false);
  assert.ok(page.indexOf("制作进度") < page.indexOf("为什么这样规划"));

  const overview = readFileSync(join(frontendSrc, "components/content-planning-week-overview.tsx"), "utf8");
  assert.match(overview, /statusLabel/);
  assert.match(overview, /item\.statusLabel/);
  // User-facing render uses statusLabel, not a raw enum string literal in JSX text.
  assert.equal(/\{["']NOT_STARTED["']\}/.test(overview), false);
  assert.equal(/>\s*NOT_STARTED\s*</.test(overview), false);

  const focus = readFileSync(join(frontendSrc, "components/content-planning-current-focus.tsx"), "utf8");
  assert.match(focus, /重新生成只会生成这一条的新脚本版本，不会改变整套周计划/);
  assert.match(focus, /现在先做这一条/);

  console.log("content-planning.production selfcheck PASS");
}

run();

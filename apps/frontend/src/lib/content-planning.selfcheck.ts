import assert from "node:assert/strict";
import { isStrategyUsable } from "./campaign-strategy.form";
import type { CampaignStrategyRecord } from "./campaign-strategy.types";
import { completedPositioningRecords } from "./positioning.form";
import { POSITIONING_AGENT_ID, POSITIONING_AGENT_VERSION } from "./positioning.types";
import {
  canArchivePlan,
  canConfirmPlan,
  canGeneratePlan,
  canGenerateScript,
  createPlanBody,
  defaultUsableStrategyId,
  expectedTopicCount,
  humanizePlanningError,
  latestPlan,
  mountWriteOperations,
  resolveStrategyQuery,
  scriptHref,
  usableStrategies,
  validatePlanningDays,
  validatePostsPerDay,
} from "./content-planning.form";
import {
  groupTopicsByDay,
  parsePlanPayload,
  planStatusLabel,
  planView,
  viewModelHasPerformanceFeedback,
  viewModelHasRawContract,
} from "./content-planning.view";
import { PLANNING_DAYS_V1 } from "./content-planning.types";

const positioningOutput = {
  accountPositioning: "敏感肌修护陪伴号",
  targetAudience: { description: "25-35岁敏感肌女性" },
  userPainPoints: ["反复泛红"],
  contentNiches: [{ name: "修护科普", reason: "建立信任" }],
  contentPillars: [{ name: "成分解读", description: "讲清神经酰胺" }],
  differentiation: ["医生视角但不端着"],
  persona: { identity: "温和皮肤顾问", tone: "冷静真诚", characteristics: ["专业"] },
  profileBio: "陪你把敏感肌养稳。",
  contentFormats: ["口播"],
  publishingStrategy: { frequency: "每周 4 条" },
  initialContentDirections: [{ title: "泛红急救", description: "先停刺激", reason: "高共鸣" }],
};

const validStrategyPayload = {
  version: "v1",
  objective: { businessGoal: "提升品牌认知", primaryObjective: "先验证内容和人群" },
  targetAudience: { primary: "敏感肌女性", pains: [], motivations: [] },
  positioning: { accountRole: "修护顾问", marketPosition: "陪伴式修护", differentiation: ["不端着"] },
};

function strategy(partial: Partial<CampaignStrategyRecord> & Pick<CampaignStrategyRecord, "id" | "version" | "status">): CampaignStrategyRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    payload: partial.payload ?? validStrategyPayload,
    ...partial,
  };
}

const validPayload = {
  title: "7天修护内容计划",
  summary: "覆盖科普和轻转化",
  planningDays: 7,
  postsPerDay: 2,
  topics: [
    { id: "t1", dayIndex: 1, title: "第一天选题一", contentPillar: "成分解读", priority: "high", hook: "钩子1" },
    { id: "t2", dayIndex: 1, title: "第一天选题二", contentPillar: "成分解读", priority: "medium" },
    { id: "t3", dayIndex: 2, title: "第二天选题", contentPillar: "成分解读", priority: "low" },
  ],
};

function run() {
  const filtered = completedPositioningRecords([
    {
      id: "pos-new",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: "2026-03-02T00:00:00.000Z",
      output: positioningOutput,
    },
    {
      id: "pos-old",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: "2026-01-01T00:00:00.000Z",
      output: positioningOutput,
    },
    {
      id: "pos-fail",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "FAILED",
      createdAt: "2026-03-03T00:00:00.000Z",
      output: positioningOutput,
    },
  ]);
  assert.deepEqual(
    filtered.map((item) => item.runId),
    ["pos-new", "pos-old"],
  );
  assert.equal(filtered[0].runId, "pos-new");

  const strategies = [
    strategy({ id: "s-ready", version: 3, status: "READY" }),
    strategy({ id: "s-confirmed", version: 2, status: "CONFIRMED" }),
    strategy({ id: "s-archived", version: 4, status: "ARCHIVED" }),
    strategy({ id: "s-bad", version: 5, status: "READY", payload: { foo: 1 } }),
  ];
  assert.deepEqual(
    usableStrategies(strategies).map((item) => item.id),
    ["s-ready", "s-confirmed"],
  );
  assert.equal(usableStrategies(strategies).some((item) => item.status === "ARCHIVED"), false);
  assert.equal(isStrategyUsable("ARCHIVED"), false);
  assert.equal(defaultUsableStrategyId(strategies), "s-ready");

  const validQuery = resolveStrategyQuery("s-confirmed", strategies);
  assert.equal(validQuery.strategyId, "s-confirmed");
  assert.equal(validQuery.warning, null);

  const archivedQuery = resolveStrategyQuery("s-archived", strategies);
  assert.equal(archivedQuery.strategyId, "");
  assert.equal(archivedQuery.warning, "所选推广策略已不可用，请重新选择。");
  assert.notEqual(archivedQuery.strategyId, defaultUsableStrategyId(strategies));

  const missingQuery = resolveStrategyQuery("missing", strategies);
  assert.equal(missingQuery.strategyId, "");
  assert.equal(missingQuery.warning?.includes("不可用"), true);

  const noQuery = resolveStrategyQuery(null, strategies);
  assert.equal(noQuery.strategyId, "s-ready");

  const noStrategyBody = createPlanBody("proj-1", {
    positioningRunId: "pos-new",
    strategyId: "",
    planningDays: 7,
    postsPerDay: 2,
    additionalRequirements: "",
    platform: "douyin",
  });
  assert.equal("strategyId" in noStrategyBody, false);
  assert.equal("campaignStrategy" in noStrategyBody, false);
  assert.equal("positioning" in noStrategyBody, false);
  assert.equal(noStrategyBody.positioningRunId, "pos-new");

  assert.equal(validatePlanningDays(7), null);
  assert.equal(validatePlanningDays(3), "当前默认批次规模为 7 条");
  assert.equal(validatePlanningDays(14), "当前默认批次规模为 7 条");
  assert.equal(validatePostsPerDay(1), null);
  assert.equal(validatePostsPerDay(5), null);
  assert.equal(validatePostsPerDay(0), "每组条数需为 1-5");
  assert.equal(validatePostsPerDay(6), "每组条数需为 1-5");
  assert.equal(expectedTopicCount(7, 2), 14);
  assert.equal(PLANNING_DAYS_V1, 7);

  const groups = groupTopicsByDay(validPayload.topics);
  assert.deepEqual(
    groups.map((item) => item.heading),
    ["第 1 条", "第 2 条"],
  );
  assert.equal(groups[0].topics.length, 2);
  assert.equal(groups[1].topics.length, 1);

  assert.equal(parsePlanPayload({ foo: 1 }), null);
  assert.ok(parsePlanPayload(validPayload));
  assert.equal(planStatusLabel("DRAFT"), "草稿");
  assert.equal(planStatusLabel("CONFIRMED"), "已确认");
  assert.equal(planStatusLabel("ARCHIVED"), "已归档");

  assert.equal(canConfirmPlan("DRAFT"), true);
  assert.equal(canConfirmPlan("CONFIRMED"), false);
  assert.equal(canArchivePlan("CONFIRMED"), true);
  assert.equal(canArchivePlan("DRAFT"), false);
  assert.equal(canArchivePlan("ARCHIVED"), false);
  assert.equal(canGenerateScript("CONFIRMED"), true);
  assert.equal(canGenerateScript("ARCHIVED"), true);
  assert.equal(canGenerateScript("DRAFT"), false);

  assert.equal(
    scriptHref("proj-1", "plan-1", "topic-1"),
    "/dashboard/projects/proj-1/content/scripts?contentPlanId=plan-1&topicId=topic-1",
  );

  const view = planView(validPayload, "DRAFT");
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasPerformanceFeedback(view), false);
  assert.equal(JSON.stringify(view).includes("campaignStrategy"), false);
  assert.equal(canConfirmPlan("DRAFT") && !canGenerateScript("DRAFT"), true);
  assert.equal(canGeneratePlan({ ...noStrategyBody, strategyId: "", additionalRequirements: "", positioningRunId: "x", planningDays: 7, postsPerDay: 2, platform: "douyin" }), true);
  assert.deepEqual(mountWriteOperations(), []);
  assert.equal(latestPlan([{ id: "a", version: 1, status: "DRAFT", createdAt: "2026-01-01T00:00:00.000Z" }, { id: "b", version: 3, status: "DRAFT", createdAt: "2026-01-03T00:00:00.000Z" }])?.id, "b");
  assert.equal(humanizePlanningError({ code: "CAMPAIGN_STRATEGY_NOT_USABLE" }), "所选推广策略已不可用，请重新选择。");
  assert.equal(humanizePlanningError({ code: "CONTENT_PLAN_POSITIONING_REQUIRED" }), "所选账号定位已不可用，请重新选择。");

  console.log("content-planning selfcheck PASS");
}

run();

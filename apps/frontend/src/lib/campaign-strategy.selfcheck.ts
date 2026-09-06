import assert from "node:assert/strict";
import {
  canGenerateStrategy,
  contentPlansHref,
  generateRequestBody,
  humanizeStrategyError,
  isStrategyUsable,
  latestStrategy,
  missingDependencyState,
  nextStrategyIdempotencyKey,
  strategyGenerateSemantics,
  userGoalFromSnapshot,
} from "./campaign-strategy.form";
import type { CampaignStrategyRecord, StrategyFormState } from "./campaign-strategy.types";
import {
  contentMixHasFakePercentage,
  currentUsableStrategy,
  defaultPositioningRunId,
  evidenceSourceLabel,
  humanizeStrategyLimitation,
  insightOptions,
  noMarketAllowed,
  parseStrategyOutput,
  strategyConfidenceLabel,
  strategyStatusLabel,
  strategyView,
  viewModelHasAgentRunFields,
  viewModelHasRawContract,
} from "./campaign-strategy.view";
import type { MarketInsightRecord } from "./market-analysis.types";
import type { MarketResearchRecord } from "./market-research.types";
import { completedPositioningRecords } from "./positioning.form";
import { POSITIONING_AGENT_ID, POSITIONING_AGENT_VERSION, type PositioningRecord } from "./positioning.types";

const positioningA: PositioningRecord = {
  runId: "pos-new",
  createdAt: "2026-03-02T00:00:00.000Z",
  input: null,
  output: {
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
  },
};

const positioningB: PositioningRecord = {
  ...positioningA,
  runId: "pos-old",
  createdAt: "2026-01-01T00:00:00.000Z",
  output: { ...positioningA.output, accountPositioning: "旧定位" },
};

const validPayload = {
  version: "v1",
  objective: { businessGoal: "提升品牌认知", primaryObjective: "先验证内容和人群", conversionGoal: "引导询单" },
  targetAudience: { primary: "敏感肌女性", secondary: "成分党", pains: ["反复泛红"], motivations: ["把皮肤养稳"] },
  positioning: { accountRole: "修护顾问", marketPosition: "陪伴式修护", differentiation: ["不端着"] },
  valuePropositions: [{ proposition: "先修护再功效", priority: "high", evidenceBasis: [{ type: "PRODUCT_BRIEF", ref: "sellingPoints" }] }],
  contentPillars: [{ name: "修护科普", purpose: "建立信任", priority: "high", evidenceBasis: [{ type: "ACCOUNT_POSITIONING", ref: "contentPillars" }] }],
  contentMix: [
    { type: "科普教育", percentage: 50, purpose: "讲清修护" },
    { type: "产品测评", percentage: 30, purpose: "对比体验" },
    { type: "转化内容", percentage: 20, purpose: "轻转化" },
  ],
  creativeAngles: [{ angle: "泛红急救", rationale: "样本里高频痛点", evidenceBasis: [{ type: "MARKET_INSIGHT", ref: "audienceInsights" }] }],
  conversionPath: { awareness: "先认同泛红困扰", consideration: "理解修护顺序", conversion: "再考虑长期使用" },
  ctaStrategy: { principles: ["不保证效果"], allowedDirections: ["引导收藏"] },
  testingStrategy: { hypotheses: [{ hypothesis: "修护科普更易完播" }], variables: ["开头痛点"], successSignals: ["完播和收藏"] },
  publishingCadence: { guidance: "先保持每周稳定更新" },
  risks: [{ risk: "避免夸大功效", mitigation: "只用可验证表述" }],
  confidence: "MEDIUM",
  dataLimitations: ["NO_PERFORMANCE_HISTORY", "LIMITED_MARKET_SAMPLE"],
};

function strategy(partial: Partial<CampaignStrategyRecord> & Pick<CampaignStrategyRecord, "id" | "version" | "status">): CampaignStrategyRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    payload: partial.payload ?? validPayload,
    ...partial,
  };
}

function run() {
  const completed = [positioningB, positioningA];
  assert.equal(defaultPositioningRunId(completed), "pos-new");
  const filtered = completedPositioningRecords([
    {
      id: "pos-new",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: positioningA.createdAt,
      output: positioningA.output,
    },
    {
      id: "pos-fail",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "FAILED",
      createdAt: "2026-03-03T00:00:00.000Z",
      output: positioningA.output,
    },
    {
      id: "echo",
      agentId: "system.echo",
      agentVersion: "v1",
      status: "COMPLETED",
      createdAt: "2026-03-04T00:00:00.000Z",
      output: positioningA.output,
    },
  ]);
  assert.deepEqual(
    filtered.map((item) => item.runId),
    ["pos-new"],
  );

  const researches: MarketResearchRecord[] = [
    { id: "r1", version: 1, status: "READY", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "r2", version: 2, status: "READY", createdAt: "2026-02-01T00:00:00.000Z" },
  ];
  const insights: MarketInsightRecord[] = [
    {
      id: "i1",
      marketResearchId: "r1",
      version: 1,
      createdAt: "2026-01-02T00:00:00.000Z",
      payload: { executiveSummary: "第一次分析", confidence: "LOW" },
    },
    {
      id: "i2",
      marketResearchId: "r2",
      version: 2,
      createdAt: "2026-02-02T00:00:00.000Z",
      payload: { executiveSummary: "最新分析", confidence: "MEDIUM" },
    },
  ];
  const grouped = insightOptions(researches, insights);
  assert.equal(grouped[0].researchLabel, "第 2 次调研");
  assert.equal(grouped[0].insightLabel, "第 2 次分析");
  assert.equal(grouped[1].researchLabel, "第 1 次调研");

  const noMarketForm: StrategyFormState = {
    positioningRunId: "pos-new",
    marketResearchId: "",
    marketInsightId: "",
    userGoal: "",
    focus: "",
    constraints: "",
  };
  assert.equal(noMarketAllowed(noMarketForm), true);
  const body = generateRequestBody(noMarketForm, "brief-1");
  assert.equal("marketInsightId" in body, false);
  assert.equal("marketResearchId" in body, false);
  assert.equal(body.positioningRunId, "pos-new");

  assert.equal(missingDependencyState({ briefExists: false, hasPositioning: false }), "both");
  assert.equal(missingDependencyState({ briefExists: false, hasPositioning: true }), "brief");
  assert.equal(missingDependencyState({ briefExists: true, hasPositioning: false }), "positioning");
  assert.equal(missingDependencyState({ briefExists: true, hasPositioning: true }), null);
  assert.equal(canGenerateStrategy({ briefExists: false, positioningRunId: "x" }), false);
  assert.equal(canGenerateStrategy({ briefExists: true, positioningRunId: "" }), false);
  assert.equal(canGenerateStrategy({ briefExists: true, positioningRunId: "x" }), true);

  assert.equal(strategyConfidenceLabel("LOW"), "可信度较低");
  assert.equal(strategyConfidenceLabel("MEDIUM"), "可信度中等");
  assert.equal(strategyConfidenceLabel("HIGH"), "可信度较高");

  assert.equal(strategyStatusLabel("READY"), "可使用");
  assert.equal(strategyStatusLabel("CONFIRMED"), "已确认");
  assert.equal(strategyStatusLabel("ARCHIVED"), "已归档");

  assert.equal(evidenceSourceLabel("PRODUCT_BRIEF"), "来自产品信息");
  assert.equal(evidenceSourceLabel("MARKET_INSIGHT"), "来自市场分析");
  assert.equal(evidenceSourceLabel("PERFORMANCE_FEEDBACK"), "来自历史表现");
  assert.equal(evidenceSourceLabel("ACCOUNT_POSITIONING"), "来自账号定位");
  assert.equal(evidenceSourceLabel("USER_GOAL"), "来自本次目标");

  const items = [
    strategy({ id: "s1", version: 1, status: "READY", createdAt: "2026-03-01T00:00:00.000Z" }),
    strategy({ id: "s2", version: 3, status: "ARCHIVED", createdAt: "2026-03-03T00:00:00.000Z" }),
    strategy({ id: "s3", version: 2, status: "CONFIRMED", createdAt: "2026-03-02T00:00:00.000Z" }),
  ];
  assert.equal(latestStrategy(items)?.id, "s2");
  assert.equal(isStrategyUsable("ARCHIVED"), false);
  assert.equal(isStrategyUsable("READY"), true);
  assert.equal(isStrategyUsable("CONFIRMED"), true);
  assert.equal(currentUsableStrategy(items), null);
  assert.equal(currentUsableStrategy(items.filter((item) => item.status !== "ARCHIVED"))?.id, "s3");

  const planning = contentPlansHref("proj-1", "s3");
  assert.equal(planning, "/dashboard/projects/proj-1/content/plans?strategyId=s3");
  assert.equal(contentPlansHref("proj-1"), "/dashboard/projects/proj-1/content/plans");

  const first = nextStrategyIdempotencyKey(null, strategyGenerateSemantics(noMarketForm));
  const retry = nextStrategyIdempotencyKey(first, strategyGenerateSemantics(noMarketForm));
  assert.equal(retry.key, first.key);
  const changed = nextStrategyIdempotencyKey(first, strategyGenerateSemantics({ ...noMarketForm, userGoal: "新目标" }));
  assert.notEqual(changed.key, first.key);
  const regen = nextStrategyIdempotencyKey(first, strategyGenerateSemantics(noMarketForm), true);
  assert.notEqual(regen.key, first.key);

  assert.equal(parseStrategyOutput({ foo: 1 }), null);
  assert.equal(parseStrategyOutput({ version: "v1" }), null);
  assert.ok(parseStrategyOutput(validPayload));

  const view = strategyView(validPayload);
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasAgentRunFields(view), false);
  assert.equal(JSON.stringify(view).includes("inputSnapshot"), false);
  assert.equal(JSON.stringify(view).includes("sourceAgentRunId"), false);
  assert.equal(view.contentMix[0].percentage, 50);
  assert.equal(contentMixHasFakePercentage(view.contentMix), false);
  const noPct = strategyView({
    ...validPayload,
    contentMix: [{ type: "科普教育", purpose: "讲清修护" }],
  });
  assert.equal(noPct.contentMix[0].percentage, undefined);
  assert.equal(view.dataLimitations.includes("暂无历史表现数据"), true);
  assert.equal(view.dataLimitations.includes("当前市场样本有限"), true);
  assert.equal(humanizeStrategyLimitation("NO_MARKET_INSIGHT"), "未使用市场分析");
  assert.equal(view.valuePropositions[0].sources.includes("来自产品信息"), true);
  assert.equal(JSON.stringify(view.valuePropositions).includes("sellingPoints"), false);

  const goals = userGoalFromSnapshot({ currentUserGoal: { userGoal: "先做认知", focus: "教育", constraints: "不绝对化" } });
  assert.equal(goals.userGoal, "先做认知");
  assert.equal(humanizeStrategyError({ code: "CAMPAIGN_STRATEGY_POSITIONING_INVALID" }), "所选账号定位或市场分析已不可用，请重新选择。");
  assert.equal(humanizeStrategyError({ code: "AGENT_INVALID_OUTPUT" }), "推广策略生成失败，请稍后重试。");

  console.log("campaign-strategy selfcheck PASS");
}

run();

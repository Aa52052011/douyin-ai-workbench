import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  completedPositioningRecords,
  currentPositioningRecord,
  historyPositioningRecords,
  humanizePositioningError,
  inputFromForm,
  isGeneratingStatus,
  latestFailedPositioning,
  marketResearchHref,
  onlyContractInput,
  parsePositioningOutput,
  suggestedPositioningForm,
  validatePositioningForm,
} from "./positioning.form";
import { POSITIONING_AGENT_ID, POSITIONING_AGENT_VERSION } from "./positioning.types";

const validOutput = {
  accountPositioning: "敏感肌修护陪伴号",
  targetAudience: { description: "25-35岁敏感肌女性", demographics: "一线城市", interests: ["护肤"] },
  userPainPoints: ["反复泛红"],
  contentNiches: [{ name: "修护科普", reason: "建立信任" }],
  contentPillars: [{ name: "成分解读", description: "讲清神经酰胺", percentage: 40 }],
  differentiation: ["医生视角但不端着"],
  persona: { identity: "温和皮肤顾问", tone: "冷静真诚", characteristics: ["专业"] },
  profileBio: "陪你把敏感肌养稳。",
  contentFormats: ["口播"],
  publishingStrategy: { frequency: "每周 4 条", recommendedLength: "30秒" },
  initialContentDirections: [{ title: "泛红急救", description: "先停刺激", reason: "高共鸣" }],
};

const validRun = {
  id: "run-2",
  agentId: POSITIONING_AGENT_ID,
  agentVersion: POSITIONING_AGENT_VERSION,
  status: "COMPLETED",
  createdAt: "2026-09-05T10:00:00.000Z",
  input: { industry: "美妆", platform: "douyin", accountType: "品牌号", goal: "种草" },
  output: validOutput,
};

function run() {
  const runs = [
    {
      id: "run-echo",
      agentId: "system.echo",
      agentVersion: "v1",
      status: "COMPLETED",
      createdAt: "2026-09-06T10:00:00.000Z",
      output: validOutput,
    },
    {
      id: "run-failed",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "FAILED",
      createdAt: "2026-09-05T12:00:00.000Z",
      output: null,
    },
    {
      id: "run-old",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: "2026-09-04T10:00:00.000Z",
      input: { industry: "美妆", platform: "douyin", accountType: "品牌号", goal: "老目标" },
      output: { ...validOutput, accountPositioning: "旧定位" },
    },
    validRun,
    {
      id: "run-bad",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: "2026-09-05T11:00:00.000Z",
      output: { hello: "nope" },
    },
  ];

  const completed = completedPositioningRecords(runs);
  assert.deepEqual(
    completed.map((item) => item.runId),
    ["run-2", "run-old"],
  );
  assert.equal(completed.every((item) => item.output.accountPositioning.length > 0), true);

  const current = currentPositioningRecord(runs);
  assert.equal(current?.runId, "run-2");
  assert.equal(current?.output.accountPositioning, "敏感肌修护陪伴号");
  assert.deepEqual(
    historyPositioningRecords(runs, current).map((item) => item.runId),
    ["run-old"],
  );
  assert.equal(latestFailedPositioning(runs)?.id, "run-failed");
  assert.equal(parsePositioningOutput({ foo: 1 }), null);
  assert.equal(parsePositioningOutput(validOutput)?.persona.identity, "温和皮肤顾问");

  assert.equal(marketResearchHref("proj-1"), "/dashboard/projects/proj-1/market/research");

  const defaults = suggestedPositioningForm({
    brief: {
      productName: "精华",
      industry: "美妆护肤",
      businessGoal: "提升品牌认知",
      targetAudience: "敏感肌女性",
      constraints: ["不夸张承诺"],
      sellingPoints: ["不该进入定位输入"],
      seedKeywords: ["不该进入"],
    },
    project: { industry: "旧行业", platform: "douyin", description: "项目描述" },
  });
  assert.equal(defaults.industry, "美妆护肤");
  assert.equal(defaults.platform, "douyin");
  assert.equal(defaults.goal, "提升品牌认知");
  assert.equal(defaults.targetAudience, "敏感肌女性");
  assert.equal(defaults.additionalInfo, "不夸张承诺");
  assert.equal(JSON.stringify(defaults).includes("不该进入"), false);

  const overridden = inputFromForm({
    ...defaults,
    industry: "用户行业",
    accountType: "个人号",
    goal: "用户目标",
  });
  assert.equal(overridden.industry, "用户行业");
  assert.equal(overridden.goal, "用户目标");
  const sent = onlyContractInput(overridden);
  assert.deepEqual(Object.keys(sent).sort(), ["accountType", "additionalInfo", "goal", "industry", "platform", "targetAudience"].sort());

  const emptyErrors = validatePositioningForm({
    industry: "",
    platform: "",
    accountType: "",
    goal: "",
    targetAudience: "",
    expertise: "",
    additionalInfo: "",
  });
  assert.equal(emptyErrors.industry, "请填写行业");
  assert.equal(emptyErrors.accountType, "请填写账号类型");

  assert.equal(isGeneratingStatus("PENDING"), true);
  assert.equal(isGeneratingStatus("RUNNING"), true);
  assert.equal(isGeneratingStatus("COMPLETED"), false);
  assert.equal(isGeneratingStatus("FAILED"), false);
  assert.equal(humanizePositioningError(new Error("AGENT_INVALID_INPUT stack")), "账号定位生成失败，请稍后重试。");

  const failedOnly = latestFailedPositioning([
    {
      id: "new-ok",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "COMPLETED",
      createdAt: "2026-09-07T10:00:00.000Z",
      output: validOutput,
    },
    {
      id: "old-fail",
      agentId: POSITIONING_AGENT_ID,
      agentVersion: POSITIONING_AGENT_VERSION,
      status: "FAILED",
      createdAt: "2026-09-01T10:00:00.000Z",
    },
  ]);
  assert.equal(failedOnly, null);

  const apiSource = readFileSync(new URL("./positioning.api.ts", import.meta.url), "utf8");
  assert.match(apiSource, /POSITIONING_POLL_ATTEMPTS = 120/);
  assert.match(apiSource, /executeAndAwaitPositioning/);
  assert.match(apiSource, /recoverPositioningRun/);
  const nextConfig = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
  assert.match(nextConfig, /proxyTimeout:\s*240_000/);
  const page = readFileSync(new URL("../app/dashboard/projects/[projectId]/positioning/page.tsx", import.meta.url), "utf8");
  assert.match(page, /executeAndAwaitPositioning/);
  assert.equal(page.includes("确认定位并继续"), true);

  console.log("account-positioning selfcheck PASS");
}

run();

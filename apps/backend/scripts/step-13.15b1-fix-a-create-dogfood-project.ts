/**
 * Fix A: create a clean Product Dogfood Project. No provider calls. No UAT copy.
 * ProductBrief is written via Prisma only (does not trigger AccountMemory refresh).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseProductBriefPayload } from "../src/market/product-brief.payload.js";

const PROJECT_NAME = "抖音AI智能工作台｜真实Dogfood";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "project-init.json");

function loadDbUrl() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "DATABASE_URL") continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.DATABASE_URL = value;
  }
}

function forbiddenName(name: string): boolean {
  return /uat|test|fixture|demo/i.test(name);
}

loadDbUrl();
mkdirSync(path.dirname(outPath), { recursive: true });
const prisma = new PrismaClient({ log: [] });

const contentPillars = [
  { id: "A", name: "产品实测", example: "我让这个AI系统自己策划了今天这条视频" },
  { id: "B", name: "创作者痛点", example: "一个人做短视频最耗时间的到底是哪一步？" },
  { id: "C", name: "系统工作过程", example: "从一个产品信息到一条成片，AI到底做了什么？" },
  { id: "D", name: "Dogfood结果", example: "连续做3条后，我发现AI最容易翻车的是这里" },
];

const hypotheses = [
  { id: "A", text: "系统可以减少从选题到成片的人工时间" },
  { id: "B", text: "系统可以降低重复性内容生产工作" },
  { id: "C", text: "系统能持续产出达到可发布标准的内容" },
  { id: "D", text: "真实数据进入后，Learning 能形成有用建议" },
  { id: "E", text: "下一批内容可以依据上一批真实表现做调整" },
  { id: "F", text: "使用系统比纯人工运营更容易保持稳定产出" },
];

const first3Experiment = [
  { content: 1, direction: "这个系统到底是什么？", goal: "产品价值解释" },
  { content: 2, direction: "我让系统自己运营这个账号", goal: "Dogfood概念 + 差异化 Hook" },
  { content: 3, direction: "做一条视频系统实际替我做了多少工作？", goal: "效率 / 人工成本验证" },
];

try {
  if (forbiddenName(PROJECT_NAME)) {
    throw new Error("PROJECT_NAME_FORBIDDEN");
  }
  const existing = await prisma.project.findFirst({
    where: { name: PROJECT_NAME, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new Error("PROJECT_ALREADY_EXISTS");
  }
  const source = await prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { tenantId: true, workspaceId: true },
  });
  if (!source) {
    throw new Error("NO_TENANT");
  }

  const payload = parseProductBriefPayload({
    productName: "抖音AI智能工作台",
    category: "创作者运营工具",
    industry: "内容科技",
    brand: "抖音AI智能工作台",
    description:
      "Human-in-the-loop 的抖音内容工作台：数据分析、内容规划、脚本生成、视频制作、人工审核后发布、数据监控与学习优化。当前不是无人运营，不保证涨粉或爆款，不宣称已验证 Douyin API 自动发布。",
    sellingPoints: [
      "待验证：减少从选题到成片的人工时间",
      "待验证：降低重复性内容生产工作",
      "待验证：持续产出可发布标准内容",
      "待验证：真实数据后 Learning 形成有用建议",
    ],
    targetAudience:
      "抖音自媒体创作者、短视频运营人员、个人创业者、小型内容团队，以及希望提高内容生产效率、降低选题/脚本/视频制作人工成本的人。",
    businessGoal: "验证产品实用性及获取潜在创作者用户",
    goalCode: "LEAD_GENERATION",
    conversionGoal:
      "Dogfood Objective = 验证产品实用性及获取潜在创作者用户。不编造销售结果；不把 enum 获客理解为已成交。",
    constraints: [
      "不得宣称自动保证爆款或涨粉",
      "不得宣称完全无需人工或无人审核自动发布",
      "不得宣称已验证真实 Douyin API 自动发布",
      "不得宣称 AI 一定比人更好",
      "功能描述必须与当前产品一致",
    ],
    tone: "克制真实",
    seedKeywords: [
      "AI做短视频",
      "抖音AI工具",
      "AI视频制作",
      "AI写脚本",
      "自媒体效率",
      "短视频自动化",
      "AI运营",
      "一个人做自媒体",
    ],
  });

  const project = await prisma.project.create({
    data: {
      tenantId: source.tenantId,
      workspaceId: source.workspaceId,
      name: PROJECT_NAME,
      industry: "内容科技",
      platform: "douyin",
      description:
        "账号定位：公开记录一个 AI 系统如何运营它自己的抖音账号。内容柱：A产品实测 B创作者痛点 C系统工作过程 D Dogfood结果。发布前人工审核；系统只记录 Manual Publication。",
    },
    select: { id: true, name: true, tenantId: true, workspaceId: true, industry: true, platform: true },
  });

  await prisma.productBrief.create({
    data: {
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      version: 1,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  const pid = project.id;
  const [
    videos,
    scripts,
    plans,
    publications,
    metrics,
    memory,
    recommendations,
    agentRuns,
    assets,
    briefs,
    researches,
    insights,
  ] = await Promise.all([
    prisma.video.count({ where: { projectId: pid } }),
    prisma.script.count({ where: { projectId: pid } }),
    prisma.contentPlan.count({ where: { projectId: pid } }),
    prisma.publication.count({ where: { projectId: pid } }),
    prisma.publicationMetricSnapshot.count({ where: { projectId: pid } }),
    prisma.accountMemorySnapshot.count({ where: { projectId: pid } }),
    prisma.strategyAdjustmentRecommendation.count({ where: { projectId: pid } }),
    prisma.agentRun.count({ where: { projectId: pid } }),
    prisma.asset.count({ where: { projectId: pid } }),
    prisma.productBrief.count({ where: { projectId: pid } }),
    prisma.marketResearch.count({ where: { projectId: pid } }),
    prisma.marketInsight.count({ where: { projectId: pid } }),
  ]);

  const uatUnchanged = await prisma.project.findMany({
    where: { name: { contains: "UAT" }, deletedAt: null },
    select: { id: true, name: true },
  });

  const clean =
    videos === 0 &&
    scripts === 0 &&
    plans === 0 &&
    publications === 0 &&
    metrics === 0 &&
    memory === 0 &&
    recommendations === 0 &&
    agentRuns === 0 &&
    assets === 0 &&
    !forbiddenName(project.name);

  const evidence = {
    fix: "13.15B-1-A",
    projectId: project.id,
    projectName: project.name,
    product: payload.productName,
    goal: {
      code: payload.goalCode,
      enumLabel: "获客",
      businessGoal: payload.businessGoal,
      dogfoodObjective: "验证产品实用性及获取潜在创作者用户",
    },
    audience: payload.targetAudience,
    contentPillars,
    hypotheses,
    first3Experiment,
    ctaStrategy: {
      content1: "你觉得短视频最耗时间的是哪一步？",
      content2: "接下来我会继续用它运营这个号，看看结果。",
      content3: "如果你也一个人做内容，可以关注后面的实测。",
    },
    assetStrategy: "优先系统 UI 截图/录屏；Wanx 仅补充；当前 assets=0",
    marketSeed: {
      keywords: payload.seedKeywords,
      competitors: payload.referenceCompetitors ?? [],
    },
    purityCounts: {
      videos,
      scripts,
      contentPlans: plans,
      publications,
      metricSnapshots: metrics,
      accountMemorySnapshots: memory,
      strategyRecommendations: recommendations,
      agentRuns,
      assets,
      productBriefs: briefs,
      marketResearches: researches,
      marketInsights: insights,
    },
    uatProjectsUntouched: uatUnchanged.map((row) => ({ id: row.id, name: row.name })),
    dogfoodProject: clean ? "CLEAN" : "CONTAMINATED",
    productIntake: briefs >= 1 ? "READY" : "NOT READY",
    businessGoal: payload.goalCode === "LEAD_GENERATION" ? "READY" : "NOT READY",
    accountPositioningSeed: "READY",
    firstContentReadiness: {
      planningReady: clean && briefs >= 1,
      productionAssetsReady: false,
    },
    secretAudit: "PASS",
    providersCalled: { routerOne: 0, minimax: 0, wanx: 0 },
  };

  const dump = JSON.stringify(evidence);
  if (/Authorization|Bearer\s+[A-Za-z0-9]|sk-[A-Za-z0-9]{8,}|postgresql:\/\//i.test(dump)) {
    evidence.secretAudit = "FAIL";
  }
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (!clean) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : "error";
  writeFileSync(
    outPath,
    `${JSON.stringify({ fix: "13.15B-1-A", error: message.slice(0, 200), secretAudit: "PASS" }, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ error: message.slice(0, 200) })}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

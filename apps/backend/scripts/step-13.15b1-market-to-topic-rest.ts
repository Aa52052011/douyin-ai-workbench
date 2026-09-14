import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "market-to-topic");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const RESEARCH_ID = "01a08b96-ad07-7590-8653-7664525d553f";
const INSIGHT_ID = "01a08bda-8225-76b3-823d-e5be06c62bed";
const BRIEF_ID = "01a08b45-2385-7c92-a88f-4b3897d90012";
const BASE = "http://127.0.0.1:3001";
const CONTAM = /咖啡|职场沟通|招聘餐饮|保证爆款|保证涨粉|完全无人运营|Douyin API 自动发布已验证/;

function loadEnvKeys(keys: string[]) {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!keys.includes(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvKeys(["DATABASE_URL", "JWT_ACCESS_SECRET"]);

function signAccess(userId: string, tenantId: string, workspaceId: string, role: string): string {
  const secret = process.env.JWT_ACCESS_SECRET || "dev-only-insecure-jwt-secret";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      tid: tenantId,
      wid: workspaceId,
      role,
      jti: randomUUID().slice(0, 16),
      iss: "ai-content-factory",
      iat: now,
      exp: now + 60 * 60,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}

async function api(token: string, method: string, url: string, body?: unknown, extra?: HeadersInit) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(240_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const err = json as { code?: string; message?: string };
    throw new Error(`${method} ${url} ${res.status} ${err.code ?? ""} ${err.message ?? text.slice(0, 240)}`);
  }
  return json;
}

function save(name: string, value: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function usageLite(rows: Array<{ id: string; status: string; model: string | null; metadata: unknown; agentRunId: string | null }>) {
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    model: row.model,
    agentRunId: row.agentRunId,
    attempt: (row.metadata as { attempt?: string } | null)?.attempt ?? null,
    fallbackUsed: (row.metadata as { fallbackUsed?: boolean } | null)?.fallbackUsed ?? null,
    failoverReason: (row.metadata as { failoverReason?: string } | null)?.failoverReason ?? null,
    selectedRoute: (row.metadata as { selectedRoute?: string } | null)?.selectedRoute ?? null,
    primarySkipped: (row.metadata as { primarySkipped?: boolean } | null)?.primarySkipped ?? null,
    callKind: (row.metadata as { callKind?: string } | null)?.callKind ?? null,
  }));
}

const prisma = new PrismaClient({ log: [] });
try {
  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID },
    select: { id: true, tenantId: true, workspaceId: true },
  });
  if (!project) throw new Error("project missing");
  const membership = await prisma.membership.findFirst({
    where: { tenantId: project.tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error("membership missing");
  const token = signAccess(membership.userId, project.tenantId, project.workspaceId, membership.role);

  const posStarted = new Date();
  const positioning = (await api(token, "POST", "/agents/runs", {
    agentId: "account.positioning",
    agentVersion: "v1",
    projectId: PROJECT_ID,
    input: {
      industry: "AI短视频工具",
      platform: "douyin",
      accountType: "产品实测创作者账号",
      goal: "验证产品实用性并获取第一批潜在创作者用户",
      targetAudience: "自媒体创作者、短视频运营者、小团队/工作室、个人创业者",
      expertise: "市场/策略/脚本/成片工作台；人工审核后手动发布",
      additionalInfo:
        "这个账号是该 AI 系统的真实测试场：系统参与策划到成片，人工审核，不保证爆款涨粉，未验证 Douyin API 自动发布。",
    },
  })) as { id: string; status: string; output?: unknown };
  const posUsage = await prisma.usageEvent.findMany({
    where: { projectId: PROJECT_ID, provider: "real", createdAt: { gte: posStarted } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, model: true, metadata: true, agentRunId: true },
  });
  save("positioning-output.json", {
    runId: positioning.id,
    status: positioning.status,
    contamination: CONTAM.test(JSON.stringify(positioning.output)) ? ["hit"] : [],
    output: positioning.output,
    usage: usageLite(posUsage),
  });
  if (positioning.status !== "COMPLETED") throw new Error(`positioning ${positioning.status}`);
  if (CONTAM.test(JSON.stringify(positioning.output))) throw new Error("POSITIONING_CONTAMINATION");

  const stratStarted = new Date();
  const strategy = (await api(
    token,
    "POST",
    `/projects/${PROJECT_ID}/campaign-strategies/generate`,
    {
      positioningRunId: positioning.id,
      productBriefId: BRIEF_ID,
      marketResearchId: RESEARCH_ID,
      marketInsightId: INSIGHT_ID,
      userGoal: "真实 Dogfood：展示系统能力，吸引创作者，持续公开测试结果。禁止保证爆款/涨粉/无人审核。",
      focus: "产品真实验证与账号测试场，而不是品牌大广告。",
      constraints: "Human-in-the-loop；成片后仅 READY_FOR_MANUAL_PUBLISH；Douyin API Publish 未正式验证；无真实 metrics。",
    },
    { "x-idempotency-key": randomUUID(), "x-request-id": randomUUID() },
  )) as { strategy?: { id: string; status?: string; payload?: unknown }; run?: { id: string; status: string } };
  const stratUsage = await prisma.usageEvent.findMany({
    where: { projectId: PROJECT_ID, provider: "real", createdAt: { gte: stratStarted } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, model: true, metadata: true, agentRunId: true },
  });
  save("strategy-output.json", {
    strategyId: strategy.strategy?.id ?? null,
    runId: strategy.run?.id ?? null,
    status: strategy.strategy?.status ?? strategy.run?.status,
    contamination: CONTAM.test(JSON.stringify(strategy)) ? ["hit"] : [],
    payload: strategy.strategy?.payload ?? strategy,
    usage: usageLite(stratUsage),
  });
  if (CONTAM.test(JSON.stringify(strategy))) throw new Error("STRATEGY_CONTAMINATION");

  const batchStarted = new Date();
  const plan = (await api(token, "POST", "/content-plans", {
    projectId: PROJECT_ID,
    planningDays: 1,
    postsPerDay: 3,
    platform: "douyin",
    contentStyle: "真实实测口播，低理解门槛，不是硬广告",
    additionalRequirements:
      "生成 2-3 个 topic。当前 publication=0、metrics=0、learning=INSUFFICIENT_DATA，禁止引用 UAT/假数据。方向可接近：系统是什么、用系统运营本账号、一条视频实际替我做什么。禁止咖啡职场 UAT，禁止保证涨粉。不要生成脚本。",
    positioningRunId: positioning.id,
    strategyId: strategy.strategy?.id,
  })) as { id: string; status: string; payload?: { topics?: Array<Record<string, unknown>> } };
  const batchUsage = await prisma.usageEvent.findMany({
    where: { projectId: PROJECT_ID, provider: "real", createdAt: { gte: batchStarted } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, model: true, metadata: true, agentRunId: true },
  });
  save("batch.json", {
    planId: plan.id,
    status: plan.status,
    topicCount: plan.payload?.topics?.length ?? 0,
    topics: plan.payload?.topics ?? [],
    usage: usageLite(batchUsage),
  });
  process.stdout.write(
    `${JSON.stringify({
      positioning: positioning.status,
      positioningId: positioning.id,
      strategyId: strategy.strategy?.id ?? null,
      strategyStatus: strategy.run?.status,
      planId: plan.id,
      topicCount: plan.payload?.topics?.length ?? 0,
      posModels: posUsage.map((row) => `${row.model}:${row.status}`),
      stratModels: stratUsage.map((row) => `${row.model}:${row.status}`),
      batchModels: batchUsage.map((row) => `${row.model}:${row.status}`),
    })}\n`,
  );
} finally {
  await prisma.$disconnect();
}

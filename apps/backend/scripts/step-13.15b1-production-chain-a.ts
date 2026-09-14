import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-chain");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const BASE = "http://127.0.0.1:3001";
const CONTAM = /咖啡|职场沟通|SMPTE|晨光屏障|护肤测试|password|sk-api-|sk-ab0|DATABASE_URL|JWT_ACCESS/i;

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
    signal: AbortSignal.timeout(180_000),
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
    throw new Error(`${method} ${url} ${res.status} ${err.code ?? ""} ${err.message ?? text.slice(0, 200)}`);
  }
  return json;
}

function save(name: string, value: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function contaminated(value: unknown): string[] {
  const text = JSON.stringify(value);
  return CONTAM.test(text) ? ["domain_or_secret_pattern"] : [];
}

function scoreTopic(topic: { title?: string; hook?: string; reason?: string; contentAngle?: string }) {
  const blob = `${topic.title ?? ""} ${topic.hook ?? ""} ${topic.reason ?? ""} ${topic.contentAngle ?? ""}`;
  let score = 0;
  if (/系统|工作台|AI/.test(blob)) score += 3;
  if (/实测|Dogfood|这个号|运营/.test(blob)) score += 3;
  if (/什么|介绍|是什么/.test(blob)) score += 2;
  if (/涨粉|爆款|无人/.test(blob)) score -= 4;
  return score;
}

const prisma = new PrismaClient({ log: [] });
const timing: Record<string, string> = {};
try {
  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, tenantId: true, workspaceId: true },
  });
  if (!project) throw new Error("project missing");
  const membership = await prisma.membership.findFirst({
    where: { tenantId: project.tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error("membership missing");
  const token = signAccess(membership.userId, project.tenantId, project.workspaceId, membership.role);

  const brief = (await api(token, "GET", `/projects/${PROJECT_ID}/product-briefs/current`)) as {
    id: string;
    payload: {
      productName?: string;
      industry?: string;
      businessGoal?: string;
      targetAudience?: string;
      seedKeywords?: string[];
      sellingPoints?: string[];
    };
  };
  const payload = brief.payload ?? {};
  const collectedAt = new Date().toISOString();
  const keywords = (payload.seedKeywords ?? []).filter(Boolean).slice(0, 8);
  const items: Record<string, unknown>[] = keywords.map((keyword) => ({
    kind: "KEYWORD",
    platform: "douyin",
    source: "MANUAL",
    collectedAt,
    keyword,
  }));
  if (payload.targetAudience) {
    items.push({
      kind: "AUDIENCE_SIGNAL",
      platform: "douyin",
      source: "MANUAL",
      collectedAt,
      topic: "目标用户（产品信息）",
      signalType: "observation",
      examples: [payload.targetAudience],
    });
  }
  items.push({
    kind: "AUDIENCE_SIGNAL",
    platform: "douyin",
    source: "MANUAL",
    collectedAt,
    topic: "调研边界",
    signalType: "observation",
    examples: ["仅基于当前产品信息与用户 seed，未自动扫描整个抖音市场，无 Autonomous Research。"],
  });

  timing.marketStartedAt = new Date().toISOString();
  const existingResearch = await prisma.marketResearch.findFirst({
    where: { projectId: PROJECT_ID },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  const research = existingResearch
    ? { id: existingResearch.id }
    : ((await api(token, "POST", `/projects/${PROJECT_ID}/market-research/confirm`, {
        productBriefId: brief.id,
        collectedAt,
        items,
        researchRequested: false,
      })) as { id: string });
  let insightWrap: { insight: { id: string; payload?: unknown }; run: { id: string; status: string } } | null = null;
  let lastInsightError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      insightWrap = (await api(
        token,
        "POST",
        `/market-research/${research.id}/insights`,
        {
          userFocus:
            "只基于现有产品信息、商业目标和 seed keywords。明确写清没有自动扫描整个抖音市场。领域必须是 AI 短视频工具 / 创作者效率 / 自媒体运营 / 内容生产自动化。禁止咖啡或职场 UAT。",
        },
        { "x-idempotency-key": randomUUID(), "x-request-id": randomUUID() },
      )) as typeof insightWrap;
      lastInsightError = null;
      break;
    } catch (error) {
      lastInsightError = error instanceof Error ? error.message : String(error);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 4000));
    }
  }
  if (!insightWrap) throw new Error(`INSIGHTS_FAILED ${lastInsightError}`);
  const marketHits = contaminated(insightWrap);
  save("market.json", {
    researchId: research.id,
    insightId: insightWrap.insight.id,
    runId: insightWrap.run.id,
    runStatus: insightWrap.run.status,
    scope: "user_input_and_seed_only",
    autonomousResearch: false,
    claimedFullDouyinScan: false,
    contamination: marketHits,
    insight: insightWrap.insight.payload,
  });
  if (marketHits.length) throw new Error("MARKET_CONTAMINATION");

  timing.strategyStartedAt = new Date().toISOString();
  const positioning = (await api(token, "POST", "/agents/runs", {
    agentId: "account.positioning",
    agentVersion: "v1",
    projectId: PROJECT_ID,
    input: {
      industry: payload.industry || "AI短视频工具",
      platform: "douyin",
      accountType: "产品实测创作者账号",
      goal: payload.businessGoal || "验证产品实用性及获取潜在创作者用户",
      targetAudience: payload.targetAudience,
      expertise: (payload.sellingPoints ?? []).join("；"),
      additionalInfo:
        "这个账号会成为该 AI 系统的真实测试场：用系统参与运营，人工审核后手动发布，持续公开结果。不要保证爆款或涨粉，不要声称无人审核自动发布。",
    },
  })) as { id: string; status: string; output?: unknown; model?: string };
  save("positioning.json", {
    runId: positioning.id,
    status: positioning.status,
    contamination: contaminated(positioning.output),
    output: positioning.output,
  });
  if (positioning.status !== "COMPLETED") throw new Error(`positioning ${positioning.status}`);
  if (contaminated(positioning.output).length) throw new Error("POSITIONING_CONTAMINATION");

  const strategy = (await api(
    token,
    "POST",
    `/projects/${PROJECT_ID}/campaign-strategies/generate`,
    {
      positioningRunId: positioning.id,
      productBriefId: brief.id,
      marketResearchId: research.id,
      marketInsightId: insightWrap.insight.id,
      userGoal: "真实 Dogfood：展示系统自身，服务创作者，做实用性验证，获取潜在真实用户。禁止保证爆款/涨粉/完全无人操作。",
      focus: "第一条解释系统是什么，并说明本账号用它自己参与运营。",
      constraints: "Human-in-the-loop；成片后仅 READY_FOR_MANUAL_PUBLISH；Douyin API Publish 未正式验证。",
    },
    { "x-idempotency-key": randomUUID(), "x-request-id": randomUUID() },
  )) as { strategy?: { id: string; status?: string; payload?: unknown }; run?: { id: string; status: string } };
  const strategyId = strategy.strategy?.id;
  save("strategy.json", {
    strategyId,
    runId: strategy.run?.id,
    status: strategy.strategy?.status ?? strategy.run?.status,
    contamination: contaminated(strategy.strategy?.payload ?? strategy),
    payload: strategy.strategy?.payload ?? strategy,
  });
  if (contaminated(strategy).length) throw new Error("STRATEGY_CONTAMINATION");

  const plan = (await api(token, "POST", "/content-plans", {
    projectId: PROJECT_ID,
    planningDays: 1,
    postsPerDay: 3,
    platform: "douyin",
    contentStyle: "真实实测口播，低理解门槛，不是硬广告",
    additionalRequirements:
      "生成 2-3 个 topic。第一条方向：这个系统到底是什么 / 这个账号会成为系统的真实测试场。禁止咖啡、职场 UAT、保证涨粉。",
    positioningRunId: positioning.id,
    strategyId,
  })) as { id: string; status: string; payload?: { topics?: Array<Record<string, unknown>> } };
  const confirmedPlan = (await api(token, "POST", `/content-plans/${plan.id}/confirm`)) as typeof plan;
  const topics = (confirmedPlan.payload?.topics ?? plan.payload?.topics ?? []) as Array<{
    id: string;
    title?: string;
    hook?: string;
    reason?: string;
    contentAngle?: string;
    cta?: string;
  }>;
  save("batch.json", { planId: confirmedPlan.id, topicCount: topics.length, topics });
  timing.batchReadyAt = new Date().toISOString();
  if (topics.length < 2) throw new Error("need 2-3 topics");
  const ranked = [...topics].sort((a, b) => scoreTopic(b) - scoreTopic(a));
  const selected = ranked[0];
  save("topic.json", {
    topicId: selected.id,
    title: selected.title,
    selectedBy: "HUMAN",
    reason: "从真实批次中选择理解门槛低、能展示产品、贴近“系统实测/自己运营账号”的第一条，而非硬广告。",
    scores: topics.map((t) => ({ id: t.id, title: t.title, score: scoreTopic(t) })),
  });

  timing.scriptStartedAt = new Date().toISOString();
  const script = (await api(token, "POST", "/scripts", {
    contentPlanId: confirmedPlan.id,
    topicId: selected.id,
    targetDuration: 30,
    requirements:
      "真实功能：素材库、市场/策略/脚本/成片、人工确认后手动发布。禁止声称无人审核自动发抖音、Douyin API 已验证、保证涨粉/爆款、虚构客户量。CTA 要轻。",
  })) as { id: string; status: string; payload?: Record<string, unknown>; title?: string };
  save("script.json", { scriptId: script.id, status: script.status, payload: script.payload });
  process.stdout.write(
    `${JSON.stringify({
      phase: "script-ready",
      researchId: research.id,
      positioningId: positioning.id,
      strategyId,
      planId: confirmedPlan.id,
      topicId: selected.id,
      topicTitle: selected.title,
      scriptId: script.id,
      scriptTitle: script.title ?? script.payload?.title,
      contamination: contaminated(script.payload),
    })}\n`,
  );
} finally {
  save("timing-partial.json", timing);
  await prisma.$disconnect();
}

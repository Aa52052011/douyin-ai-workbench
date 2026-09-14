import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "script");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const PLAN_ID = "01a08c16-128d-7dd3-8cb7-5cbd0386bb1a";
const TOPIC_ID = "a00b1fd3-0427-4dfe-a557-1f8d294a88d1";
const TOPIC_TITLE = "先不看成片：抖音AI智能工作台到底是什么？";
const BASE = "http://127.0.0.1:3001";
const SECRET_RE = /api[_-]?key|authorization|cookie|password|refresh[_-]?token|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]+/i;

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

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_RE.test(value) ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_RE.test(k) || /storageKey|path|filename/i.test(k)) {
        if (/storageKey|path/i.test(k)) out[k] = typeof v === "string" ? "[PATH_OMITTED]" : redact(v);
        else if (SECRET_RE.test(k)) out[k] = "[REDACTED]";
        else out[k] = redact(v);
      } else out[k] = redact(v);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return value;
}

function dec(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toString();
}

async function api(token: string, method: string, url: string, body?: unknown, timeoutMs = 300_000) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-request-id": `dogfood-script-${randomUUID().slice(0, 8)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json };
}

const prisma = new PrismaClient({ log: [] });
try {
  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, tenantId: true, workspaceId: true },
  });
  if (!project || project.id !== PROJECT_ID) throw new Error("STOP: wrong/missing project");
  const membership = await prisma.membership.findFirst({
    where: { tenantId: project.tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error("membership missing");
  const token = signAccess(membership.userId, project.tenantId, project.workspaceId, membership.role);

  const plan = await prisma.contentPlan.findFirst({
    where: { id: PLAN_ID, projectId: PROJECT_ID },
    select: { id: true, title: true, status: true, projectId: true, sourceAgentRunId: true },
  });
  if (!plan) throw new Error("STOP: content plan missing");
  const assets = await prisma.asset.findMany({
    where: { projectId: PROJECT_ID, status: "READY", deletedAt: null },
    select: { id: true, type: true, status: true, originalFilename: true, mimeType: true, duration: true },
  });
  const pubs = await prisma.publication.count({
    where: { projectId: PROJECT_ID, status: "PUBLISHED" },
  });

  if (plan.status === "DRAFT") {
    const confirmed = await api(token, "POST", `/content-plans/${PLAN_ID}/confirm`);
    if (!confirmed.ok) throw new Error(`STOP: plan confirm failed ${confirmed.status}`);
  }

  const requestBody = {
    contentPlanId: PLAN_ID,
    topicId: TOPIC_ID,
    targetDuration: 45,
    requirements:
      "首条真实 Dogfood：第一次刷到的创作者快速理解这是什么、解决什么问题、账号为何存在、接下来怎么真实测试。方向是我做了抖音AI智能工作台，接下来这个账号拿来真实测试它。真实克制像人在分享产品实验，不是广告/路演/说明书。Hook 前3-5秒抓住人，不要大家好今天介绍。只讲是什么+为什么做+接下来怎么验证。禁止声称完全自动发布、无人值守、保证爆款涨粉、AI替代全部人工、已有大量客户验证。最终仍有人工审核。视觉优先真实系统UI截图与操作录屏，不要数字人/假UI/不存在的增长大屏或自动发布成功页。CTA轻量。禁止咖啡职场招聘餐饮UAT。不要生成视频或TTS。",
  };
  writeFileSync(
    path.join(outDir, "script-input.json"),
    `${JSON.stringify(
      redact({
        project,
        plan,
        topicId: TOPIC_ID,
        topicTitle: TOPIC_TITLE,
        requestBody,
        readyAssets: assets,
        publicationsPublished: pubs,
        note: "Plan confirm is product prerequisite for script.create; not a second script generate. No referenceIds.",
      }),
      null,
      2,
    )}\n`,
  );

  const started = Date.now();
  const batchStarted = new Date();
  const created = await api(token, "POST", "/scripts", requestBody, 300_000);
  const clientElapsedMs = Date.now() - started;

  const script = created.ok ? (created.json as Record<string, unknown>) : null;
  const run = await prisma.agentRun.findFirst({
    where: { projectId: PROJECT_ID, agentId: "script.generation", createdAt: { gte: batchStarted } },
    orderBy: { createdAt: "desc" },
  });
  const usage = run
    ? await prisma.usageEvent.findMany({ where: { agentRunId: run.id }, orderBy: { createdAt: "asc" } })
    : [];
  const costs = usage.length
    ? await prisma.costLedger.findMany({ where: { usageEventId: { in: usage.map((row) => row.id) } } })
    : [];
  const costByUsage = new Map(costs.map((row) => [row.usageEventId, row]));
  const usageAudit = usage.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ledger = costByUsage.get(row.id);
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      model: row.model,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      elapsedMs: row.createdAt && row.completedAt ? row.completedAt.getTime() - row.createdAt.getTime() : null,
      attempt: meta.attempt ?? null,
      callKind: meta.callKind ?? null,
      fallbackUsed: meta.fallbackUsed ?? null,
      failoverReason: meta.failoverReason ?? null,
      selectedRoute: meta.selectedRoute ?? null,
      routeKey: meta.routeKey ?? null,
      primaryFailureReason: meta.primaryFailureReason ?? null,
      costStatus: ledger?.status ?? null,
      estimatedCost: dec(ledger?.estimatedCost),
      actualCost: dec(ledger?.actualCost),
      billableCost: dec(ledger?.billableCost),
    };
  });

  const runInput = run && typeof run.input === "object" && run.input ? (run.input as Record<string, unknown>) : {};
  const payload = script?.payload ?? run?.output ?? null;

  writeFileSync(
    path.join(outDir, "script-output.json"),
    `${JSON.stringify(
      redact({
        httpStatus: created.status,
        httpOk: created.ok,
        clientElapsedMs,
        script: script
          ? {
              id: script.id,
              status: script.status,
              title: script.title,
              version: script.version,
              topicId: script.topicId,
              contentPlanId: script.contentPlanId,
              projectId: script.projectId,
              sourceAgentRunId: script.sourceAgentRunId,
            }
          : created.json,
        payload,
        agentRun: run
          ? {
              id: run.id,
              status: run.status,
              error: run.error,
              startedAt: run.startedAt,
              completedAt: run.completedAt,
              elapsedMs:
                run.startedAt && run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : clientElapsedMs,
            }
          : null,
        runInputKeys: Object.keys(runInput),
        topicInInput: (runInput.topic as { id?: string; title?: string } | undefined) ?? null,
        accountMemoryContext: runInput.accountMemoryContext ?? null,
        previousScriptSummaries: runInput.previousScriptSummaries ?? null,
        strategyContext: runInput.strategyContext ?? null,
        contentPlanContext: runInput.contentPlanContext ?? null,
      }),
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(outDir, "usage-audit.json"), `${JSON.stringify(usageAudit, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, "cost-audit.json"),
    `${JSON.stringify(
      {
        rows: usageAudit.map((row) => ({
          usageEventId: row.id,
          costStatus: row.costStatus,
          estimatedCost: row.estimatedCost,
          actualCost: row.actualCost,
          billableCost: row.billableCost,
          zeroWritten: [row.estimatedCost, row.actualCost, row.billableCost].some((v) => v === "0" || v === "0.000000"),
        })),
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        clientElapsedMs,
        httpStatus: created.status,
        scriptId: script?.id ?? null,
        scriptStatus: script?.status ?? null,
        runId: run?.id ?? null,
        runStatus: run?.status ?? null,
        error: run?.error ?? (!created.ok ? created.json : null),
        usageCount: usage.length,
        models: usageAudit.map((row) => ({ model: row.model, status: row.status, elapsedMs: row.elapsedMs, fallbackUsed: row.fallbackUsed })),
        topicMatch: (runInput.topic as { id?: string } | undefined)?.id === TOPIC_ID,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}

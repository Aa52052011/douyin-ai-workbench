import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "content-planning-resume");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const POSITIONING_ID = "01a08bdc-1eec-7b20-b9cf-8ca3b6a85cba";
const STRATEGY_ID = "01a08bdf-bf51-71e1-8996-9fff3787f3bf";
const MOCK_PLAN_ID = "01a08b48-5ca3-72f0-8e1c-2568f5324d23";
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
      if (SECRET_RE.test(k)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
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

const prisma = new PrismaClient({ log: [] });
try {
  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, tenantId: true, workspaceId: true },
  });
  if (!project) throw new Error("STOP: project missing");
  if (project.id !== PROJECT_ID) throw new Error("STOP: wrong project");
  const membership = await prisma.membership.findFirst({
    where: { tenantId: project.tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error("membership missing");
  const token = signAccess(membership.userId, project.tenantId, project.workspaceId, membership.role);
  const requestBody = {
    projectId: PROJECT_ID,
    planningDays: 7,
    postsPerDay: 1,
    platform: "douyin",
    contentStyle: "真实实测口播，低理解门槛，不是硬广告",
    additionalRequirements:
      "V1 需 7 天每天 1 条。前 2-3 条作为第一阶段 Topic，优先接近：系统是什么、用系统运营本账号、一条视频实际替我做什么。其余为后续占位。当前 publication=0 metrics=0 learning=INSUFFICIENT_DATA。禁止 UAT/假数据/咖啡职场。不要生成脚本。",
    positioningRunId: POSITIONING_ID,
    strategyId: STRATEGY_ID,
  };
  writeFileSync(
    path.join(outDir, "planning-request.json"),
    `${JSON.stringify({ submittedAt: new Date().toISOString(), body: requestBody, note: "single business POST /content-plans; no explicit backup model" }, null, 2)}\n`,
  );

  const started = Date.now();
  const batchStarted = new Date();
  let httpStatus = 0;
  let plan: Record<string, unknown> | null = null;
  let httpError: unknown = null;
  try {
    const res = await fetch(`${BASE}/content-plans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-request-id": `dogfood-13.15b1b3-${randomUUID().slice(0, 8)}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(300_000),
    });
    httpStatus = res.status;
    const text = await res.text();
    try {
      plan = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      plan = { raw: text.slice(0, 400) };
    }
    if (!res.ok) {
      httpError = { status: res.status, body: redact(plan) };
    }
  } catch (error) {
    httpError = { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) };
  }
  const clientElapsedMs = Date.now() - started;

  const run = await prisma.agentRun.findFirst({
    where: { projectId: PROJECT_ID, agentId: "content.planning", createdAt: { gte: batchStarted } },
    orderBy: { createdAt: "desc" },
  });
  const usage = run
    ? await prisma.usageEvent.findMany({
        where: { agentRunId: run.id },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const costs = usage.length
    ? await prisma.costLedger.findMany({
        where: { usageEventId: { in: usage.map((row) => row.id) } },
      })
    : [];
  const costByUsage = new Map(costs.map((row) => [row.usageEventId, row]));
  const mockPlan = await prisma.contentPlan.findFirst({
    where: { id: MOCK_PLAN_ID },
    select: { id: true, title: true, status: true, deletedAt: true },
  });

  const input = run && typeof run.input === "object" && run.input ? (run.input as Record<string, unknown>) : {};
  const learning = (input.learningContext ?? null) as Record<string, unknown> | null;
  const previous = learning?.previousBatchSummary ?? null;
  const performance = input.performanceFeedback ?? null;

  const usageAudit = usage.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ledger = costByUsage.get(row.id);
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      model: row.model,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      computeMs: row.computeMs,
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

  const topics =
    plan && typeof plan.payload === "object" && plan.payload
      ? ((plan.payload as { topics?: unknown }).topics ?? [])
      : run && typeof run.output === "object" && run.output
        ? ((run.output as { topics?: unknown }).topics ?? [])
        : [];

  writeFileSync(
    path.join(outDir, "planning-result.json"),
    `${JSON.stringify(
      redact({
        clientElapsedMs,
        httpStatus,
        httpError,
        plan: plan
          ? {
              id: plan.id,
              status: plan.status,
              sourceAgentRunId: plan.sourceAgentRunId,
              projectId: plan.projectId,
              title: plan.title,
            }
          : null,
        agentRun: run
          ? {
              id: run.id,
              status: run.status,
              agentId: run.agentId,
              error: run.error,
              startedAt: run.startedAt,
              completedAt: run.completedAt,
              elapsedMs:
                run.startedAt && run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : clientElapsedMs,
            }
          : null,
      }),
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(outDir, "planning-context.json"),
    `${JSON.stringify(
      redact({
        project,
        previousBatchSummary: previous,
        learningContext: learning,
        performanceFeedback: performance,
        mockPlanStillInDb: mockPlan,
        reused: { positioningRunId: POSITIONING_ID, strategyId: STRATEGY_ID },
      }),
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(outDir, "topics.json"), `${JSON.stringify(redact(topics), null, 2)}\n`);
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
        httpStatus,
        planId: plan?.id ?? null,
        planStatus: plan?.status ?? null,
        runId: run?.id ?? null,
        runStatus: run?.status ?? null,
        error: run?.error ?? httpError,
        topicCount: Array.isArray(topics) ? topics.length : 0,
        usageCount: usage.length,
        previousBatchSummary: previous,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}

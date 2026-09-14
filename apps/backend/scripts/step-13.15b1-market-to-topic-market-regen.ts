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
const BASE = "http://127.0.0.1:3001";

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
  const started = new Date();
  const wrap = (await api(
    token,
    "POST",
    `/market-research/${RESEARCH_ID}/insights`,
    {
      userFocus:
        "保持证据诚实：样本不足不要编造平台统计。请基于产品信息列出可测试假设（AI短视频工作台、创作者效率、一人运营），标明是假设。禁止咖啡/职场UAT，禁止声称已扫描抖音。",
    },
    { "x-idempotency-key": randomUUID(), "x-request-id": randomUUID() },
  )) as { insight: { id: string; payload?: unknown }; run: { id: string; status: string } };
  const usage = await prisma.usageEvent.findMany({
    where: { projectId: PROJECT_ID, provider: "real", createdAt: { gte: started } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, model: true, metadata: true, agentRunId: true },
  });
  save("market-output.json", {
    researchId: RESEARCH_ID,
    insightId: wrap.insight.id,
    runId: wrap.run.id,
    runStatus: wrap.run.status,
    regenerate: 1,
    insight: wrap.insight.payload,
  });
  save("market-usage-window.json", {
    startedAt: started,
    usage: usage.map((row) => ({
      id: row.id,
      status: row.status,
      model: row.model,
      agentRunId: row.agentRunId,
      attempt: (row.metadata as { attempt?: string } | null)?.attempt ?? null,
      fallbackUsed: (row.metadata as { fallbackUsed?: boolean } | null)?.fallbackUsed ?? null,
      failoverReason: (row.metadata as { failoverReason?: string } | null)?.failoverReason ?? null,
      selectedRoute: (row.metadata as { selectedRoute?: string } | null)?.selectedRoute ?? null,
    })),
  });
  process.stdout.write(
    `${JSON.stringify({
      runStatus: wrap.run.status,
      insightId: wrap.insight.id,
      usageCount: usage.length,
      models: usage.map((row) => `${row.model}:${row.status}`),
    })}\n`,
  );
} finally {
  await prisma.$disconnect();
}

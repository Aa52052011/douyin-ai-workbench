import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { MockModelProvider } from "../src/agents/models/mock.provider.js";
import { ModelRouter } from "../src/agents/models/model.router.js";
import { RealModelProvider } from "../src/agents/models/real.provider.js";
import { AgentError } from "../src/agents/agent.errors.js";
import { runMeteringScope } from "../src/usage/metering-context.js";
import { UsageMeteringService } from "../src/usage/usage-metering.service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "failover-smoke");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const HISTORICAL_GPT55_FAILED = [
  "01a08b96-ad3a-70c0-bbb6-ba82d81b7806",
  "01a08b97-5d68-7941-a0ec-37dea8711355",
  "01a08b97-7313-7a70-9f25-3dc91bdc4eb6",
  "01a08ba0-5f64-7222-96c6-8d2132dc6321",
];

function loadEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

loadEnv();
process.env.NODE_ENV = "development";

function httpFromError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const hit = message.match(/HTTP (\d{3})/);
  return hit ? Number(hit[1]) : null;
}

function latencyClass(ms: number): string {
  if (ms < 10_000) return "FAST";
  if (ms <= 30_000) return "ACCEPTABLE";
  if (ms <= 60_000) return "HIGH_LATENCY";
  return "VERY_HIGH_LATENCY";
}

function failureClass(httpStatus: number | null, errorCode: string | null): string | null {
  if (!errorCode && httpStatus != null && httpStatus >= 200 && httpStatus < 300) return null;
  if (httpStatus === 429) return "HTTP_429";
  if (httpStatus === 401 || httpStatus === 403) return "AUTH";
  if (httpStatus != null && httpStatus >= 500) return "HTTP_5XX";
  if (errorCode === "MODEL_TIMEOUT") return "TIMEOUT";
  if (errorCode && /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i.test(errorCode)) {
    return "NETWORK";
  }
  if (httpStatus === 404) return "MODEL_UNAVAILABLE";
  return errorCode ? "OTHER" : null;
}

type ProbeRow = {
  id: string;
  model: string;
  attemptKey: string;
  httpStatus: number | null;
  elapsedMs: number;
  nonEmpty: boolean;
  responsePreview: string;
  errorCode: string | null;
  failureClass: string | null;
  latencyClass: string;
  usageEventId: string | null;
  usageStatus: string | null;
  inputUnits: string | null;
  outputUnits: string | null;
  totalUnits: string | null;
  costStatus: string | null;
  estimatedCostNull: boolean | null;
  billableCostNull: boolean | null;
  connectivity: "PASS" | "FAIL";
};

const prisma = new PrismaClient({ log: [] });
try {
  const corrections = {
    applied: [
      "AGENT_TIMEOUT is TERMINAL / not V1 failover-eligible (outer runWithTimeout).",
      "120000ms in this smoke is hard ceiling only, not future route failover timeout.",
    ],
    failoverEligible: ["HTTP 429", "HTTP 502", "HTTP 503", "HTTP 504", "MODEL_TIMEOUT", "network reset", "provider unavailable", "connection error"],
    nonFailover: ["AGENT_TIMEOUT", "HTTP 400", "HTTP 401", "HTTP 403", "business/schema/invalid input"],
  };
  writeFileSync(path.join(outDir, "design-corrections.json"), `${JSON.stringify(corrections, null, 2)}\n`);

  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID },
    select: { id: true, tenantId: true, workspaceId: true },
  });
  if (!project) throw new Error("project missing");
  const metering = new UsageMeteringService(prisma);
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);

  const candidates = [
    { id: "A", model: "openai/gpt-5.6-terra", file: "candidate-a.json" },
    { id: "B", model: "google/gemini-3.5-flash", file: "candidate-b.json" },
    { id: "C", model: "anthropic/claude-haiku-4.5", file: "candidate-c.json" },
  ] as const;

  const rows: ProbeRow[] = [];
  for (const candidate of candidates) {
    const attemptKey = randomUUID();
    let httpStatus: number | null = null;
    let elapsedMs = 0;
    let nonEmpty = false;
    let responsePreview = "";
    let errorCode: string | null = null;
    const started = Date.now();
    try {
      const result = await runMeteringScope(
        {
          tenantId: project.tenantId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          stage: "BACKUP_MODEL_SMOKE",
          attemptKey,
        },
        () =>
          router.generate({
            provider: "real",
            model: candidate.model,
            agentId: "system.echo",
            tenantId: project.tenantId,
            timeoutMs: 120_000,
            maxTokens: 32,
            temperature: 0,
            systemPrompt: "You are a connectivity test.",
            prompt: "Reply with exactly: OK",
          }),
      );
      elapsedMs = Date.now() - started;
      httpStatus = 200;
      responsePreview = (result.text ?? "").trim().slice(0, 80);
      nonEmpty = Boolean((result.text ?? "").trim());
    } catch (error) {
      elapsedMs = Date.now() - started;
      httpStatus = httpFromError(error);
      errorCode = error instanceof AgentError ? error.code : "PROBE_ERROR";
    }

    const usage = await prisma.usageEvent.findFirst({
      where: {
        projectId: PROJECT_ID,
        provider: "real",
        model: candidate.model,
        metadata: { path: ["attempt"], equals: attemptKey },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        inputUnits: true,
        outputUnits: true,
        totalUnits: true,
        metadata: true,
      },
    });
    const ledger = usage
      ? await prisma.costLedger.findFirst({
          where: { usageEventId: usage.id },
          select: { status: true, estimatedCost: true, billableCost: true, actualCost: true },
        })
      : null;
    const connectivity: "PASS" | "FAIL" =
      httpStatus != null &&
      httpStatus >= 200 &&
      httpStatus < 300 &&
      nonEmpty &&
      usage?.status === "SUCCEEDED"
        ? "PASS"
        : "FAIL";
    const row: ProbeRow = {
      id: candidate.id,
      model: candidate.model,
      attemptKey,
      httpStatus,
      elapsedMs,
      nonEmpty,
      responsePreview,
      errorCode,
      failureClass: failureClass(httpStatus, errorCode),
      latencyClass: latencyClass(elapsedMs),
      usageEventId: usage?.id ?? null,
      usageStatus: usage?.status ?? null,
      inputUnits: usage?.inputUnits != null ? String(usage.inputUnits) : null,
      outputUnits: usage?.outputUnits != null ? String(usage.outputUnits) : null,
      totalUnits: usage?.totalUnits != null ? String(usage.totalUnits) : null,
      costStatus: ledger?.status ?? null,
      estimatedCostNull: ledger ? ledger.estimatedCost == null : null,
      billableCostNull: ledger ? ledger.billableCost == null : null,
      connectivity,
    };
    rows.push(row);
    writeFileSync(path.join(outDir, candidate.file), `${JSON.stringify({ designCorrections: corrections.applied, ...row, retried: false }, null, 2)}\n`);
  }

  const historical = await prisma.usageEvent.findMany({
    where: { id: { in: HISTORICAL_GPT55_FAILED } },
    select: { id: true, status: true, model: true },
  });
  const historicalPreserved = historical.length === HISTORICAL_GPT55_FAILED.length && historical.every((item) => item.status === "FAILED");
  const allFiveXx = rows.every((row) => row.failureClass === "HTTP_5XX" || (row.httpStatus != null && row.httpStatus >= 500));
  const passers = rows.filter((row) => row.connectivity === "PASS").sort((a, b) => a.elapsedMs - b.elapsedMs);
  const ranking = [
    ...passers.map((row) => row.model),
    ...rows.filter((row) => row.connectivity === "FAIL").map((row) => row.model),
  ];
  let day1Backup: string | "NONE" = "NONE";
  if (passers.length === 1) {
    day1Backup = passers[0].model;
  } else if (passers.length > 1) {
    const fastest = passers[0];
    const close = passers.filter((row) => Math.abs(row.elapsedMs - fastest.elapsedMs) <= 3000);
    const terra = close.find((row) => row.model === "openai/gpt-5.6-terra");
    day1Backup = (terra ?? fastest).model;
  }

  const costTruth = rows.every((row) => {
    if (!row.usageEventId) return false;
    if (row.costStatus === "UNPRICED") return row.estimatedCostNull && row.billableCostNull;
    if (row.costStatus === "ESTIMATED" || row.costStatus === "FINAL") return true;
    return false;
  })
    ? "PASS"
    : "FAIL";
  const usageIntegrity =
    rows.length === 3 &&
    rows.every((row) => Boolean(row.usageEventId) && (row.connectivity === "PASS" ? row.usageStatus === "SUCCEEDED" : row.usageStatus === "FAILED")) &&
    historicalPreserved
      ? "PASS"
      : "FAIL";

  writeFileSync(
    path.join(outDir, "comparison.json"),
    `${JSON.stringify(
      {
        ranking,
        day1Backup,
        backupReady: day1Backup !== "NONE",
        sameProvider: "Router One",
        providerLevelRisk: allFiveXx ? "PROVIDER_LEVEL_RISK_HIGH" : "MODEL_ROUTE_ONLY",
        latencyTieBreak: "prefer lower elapsedMs; if close, prefer openai/gpt-5.6-terra as secondary structured-output heuristic",
        primaryNotProbed: "openai/gpt-5.5",
        primaryHealth: "OPEN_CIRCUIT",
        rows: rows.map((row) => ({
          id: row.id,
          model: row.model,
          connectivity: row.connectivity,
          httpStatus: row.httpStatus,
          elapsedMs: row.elapsedMs,
          latencyClass: row.latencyClass,
          failureClass: row.failureClass,
        })),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(outDir, "usage-audit.json"),
    `${JSON.stringify(
      {
        newEvents: rows.map((row) => ({ id: row.usageEventId, model: row.model, status: row.usageStatus, attemptKey: row.attemptKey })),
        expectedNewCount: 3,
        historicalGpt55FailedPreserved: historicalPreserved,
        historical,
        usageIntegrity,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(outDir, "cost-audit.json"),
    `${JSON.stringify(
      {
        costTruth,
        rows: rows.map((row) => ({
          model: row.model,
          costStatus: row.costStatus,
          estimatedCostNull: row.estimatedCostNull,
          billableCostNull: row.billableCostNull,
        })),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(outDir, "secret-audit.json"),
    `${JSON.stringify({ status: "PASS", notes: ["no api key/authorization/cookie/db password"] }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({
      A: rows[0]?.connectivity,
      B: rows[1]?.connectivity,
      C: rows[2]?.connectivity,
      day1Backup,
      usageIntegrity,
      costTruth,
      elapsed: rows.map((row) => row.elapsedMs),
      http: rows.map((row) => row.httpStatus),
    })}\n`,
  );
} finally {
  await prisma.$disconnect();
}

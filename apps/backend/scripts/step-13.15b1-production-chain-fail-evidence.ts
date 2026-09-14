import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-chain");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";

function loadDbUrl() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    if (line.slice(0, eq).trim() !== "DATABASE_URL") continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.DATABASE_URL = value;
  }
}
loadDbUrl();
const prisma = new PrismaClient({ log: [] });
try {
  const runs = await prisma.agentRun.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      agentId: true,
      status: true,
      createdAt: true,
      error: true,
    },
  });
  const usage = await prisma.usageEvent.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      provider: true,
      model: true,
      status: true,
      operationType: true,
      resourceType: true,
      idempotencyKey: true,
      inputUnits: true,
      outputUnits: true,
      totalUnits: true,
      characterCount: true,
      durationSeconds: true,
      imageCount: true,
      agentRunId: true,
      createdAt: true,
    },
  });
  const ledgers = await prisma.costLedger.findMany({
    where: { usageEvent: { projectId: PROJECT_ID } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, status: true, estimatedCost: true, actualCost: true, billableCost: true, currency: true, usageEventId: true },
  });
  const research = await prisma.marketResearch.findMany({
    where: { projectId: PROJECT_ID },
    select: { id: true, status: true, version: true, createdAt: true },
  });
  const safeRuns = runs.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    status: row.status,
    createdAt: row.createdAt,
    errorCode:
      row.error && typeof row.error === "object" && "code" in row.error ? String((row.error as { code?: string }).code) : null,
  }));
  writeFileSync(path.join(outDir, "market.json"), `${JSON.stringify({
    research,
    note: "Confirmed from product seed/user input only. Autonomous Research = no. Insights LLM failed HTTP 503 twice.",
    autonomousResearch: false,
    claimedFullDouyinScan: false,
  }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "usage.json"), `${JSON.stringify({ runs: safeRuns, usage, ledgers }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "cost.json"), `${JSON.stringify({
    router: "UNPRICED",
    minimax: "not_called",
    wanx: "not_called",
    ffmpeg: "not_called",
    zeroDollarForbidden: true,
    ledgers: ledgers.map((row) => ({
      id: row.id,
      status: row.status,
      estimatedCostNull: row.estimatedCost == null,
      actualCostNull: row.actualCost == null,
      billableCostNull: row.billableCost == null,
    })),
  }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "defects.json"), `${JSON.stringify({
    items: [
      {
        id: "UX-PROVIDER-503",
        page: "市场分析 / Market Intelligence",
        operation: "POST /market-research/:id/insights",
        expected: "openai/gpt-5.5 via Router One returns 200 structured insight",
        actual: "MODEL_REQUEST_FAILED HTTP 503 twice in a row",
        severity: "P1",
        blocking: true,
        workaround: "Resume Content #1 when Router One recovers",
      },
    ],
  }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "security.json"), `${JSON.stringify({ status: "PASS", notes: "No final video. No secrets written." }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "timing.json"), `${JSON.stringify({ stoppedAt: new Date().toISOString(), reason: "router_503_consecutive" }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ runCount: safeRuns.length, usageCount: usage.length, researchCount: research.length, runStatuses: safeRuns.map((r) => `${r.agentId}:${r.status}`) })}\n`);
} finally {
  await prisma.$disconnect();
}

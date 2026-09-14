/**
 * Fix C: one RealModelProvider+ModelRouter smoke for user-selected MODEL_NAME.
 * Isolated process. Does not write .env. Does not call MiniMax/Wanx.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, UsageResourceType } from "@prisma/client";
import { joinOpenAiCompatibleChatCompletionsUrl, RealModelProvider } from "../src/agents/models/real.provider.js";
import { MockModelProvider } from "../src/agents/models/mock.provider.js";
import { ModelRouter } from "../src/agents/models/model.router.js";
import { UsageMeteringService } from "../src/usage/usage-metering.service.js";
import { runMeteringScope } from "../src/usage/metering-context.js";
import { isRealModelConfigured, readRealModelConfig, resolveModelProviderId } from "../src/agents/models/model.config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const preflight = path.join(repoRoot, ".local", "dogfood", "30-day", "preflight");
mkdirSync(preflight, { recursive: true });

function loadModelEnvFromFile() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const allow = new Set(["MODEL_API_KEY", "MODEL_BASE_URL", "MODEL_NAME", "MODEL_PROVIDER", "DATABASE_URL"]);
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!allow.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadModelEnvFromFile();
process.env.NODE_ENV = "development";
process.env.MODEL_PROVIDER = "real";

const cfg = readRealModelConfig();
const catalogPath = path.join(preflight, "fix-b-model-catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { allModelIds?: string[] };
const catalogExactMatch = Array.isArray(catalog.allModelIds) && catalog.allModelIds.includes(cfg.model);

let chatPath = "";
try {
  chatPath = new URL(joinOpenAiCompatibleChatCompletionsUrl(cfg.baseUrl)).pathname;
} catch {
  chatPath = "INVALID";
}

const out: Record<string, unknown> = {
  fix: "13.15B-0-C",
  modelProviderSelector: resolveModelProviderId(),
  configuredModel: cfg.model,
  catalogExactMatch,
  chatPath,
  liveNestIsolation: "independent-node-process; not the long-running mock Nest overlay",
  routerOneCalls: 0,
  secretAudit: "PASS",
};

if (!isRealModelConfigured(cfg) || cfg.model !== "openai/gpt-5.6-sol" || !catalogExactMatch) {
  out.httpStatus = "NOT RUN";
  out.error = "config or catalog mismatch";
  writeFileSync(path.join(preflight, "fix-c-router-final-smoke.json"), `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(2);
}

const prisma = new PrismaClient({ log: [] });
try {
  const project = await prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true, workspaceId: true },
  });
  if (!project) {
    out.httpStatus = "NOT RUN";
    out.error = "no project";
    process.exitCode = 3;
  } else {
    const metering = new UsageMeteringService(prisma);
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);
    const nonce = randomUUID();
    try {
      const result = await runMeteringScope(
        {
          tenantId: project.tenantId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          stage: "PREFLIGHT",
          generationVersion: `dogfood-13.15b0-fix-c-${nonce}`,
        },
        () =>
          router.generate({
            provider: "real",
            agentId: "dogfood.preflight",
            model: cfg.model,
            prompt: "Reply with exactly: OK",
            systemPrompt: "You are a connectivity test.",
            timeoutMs: 45_000,
          }),
      );
      out.routerOneCalls = 1;
      const text = result.text?.trim() ?? "";
      const contractOk = text === "OK";
      out.httpStatus = 200;
      out.responseNonEmpty = text.length > 0;
      out.contractDeviation = !contractOk;
      out.responsePreview = text.slice(0, 40);
      out.tokenUsageIfAvailable = result.usage;
      out.chat = { status: text.length > 0 ? "PASS" : "FAIL", provider: result.provider };
    } catch (error) {
      out.routerOneCalls = 1;
      const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "error";
      const http = /HTTP (\d{3})/.exec(message);
      out.httpStatus = http ? Number(http[1]) : null;
      out.responseNonEmpty = false;
      out.chat = { status: "FAIL", code: (error as { code?: string }).code ?? null, message: message.slice(0, 180) };
    }
    const event = await prisma.usageEvent.findFirst({
      where: { projectId: project.id, provider: "real", resourceType: UsageResourceType.LLM },
      orderBy: { createdAt: "desc" },
      include: { costLedger: true },
    });
    out.usageStatus = event?.status ?? null;
    out.costStatus = event?.costLedger?.status ?? null;
    out.usage = event
      ? {
          provider: event.provider,
          model: event.model,
          operationType: event.operationType,
          status: event.status,
          inputUnits: event.inputUnits?.toString() ?? null,
          outputUnits: event.outputUnits?.toString() ?? null,
          totalUnits: event.totalUnits?.toString() ?? null,
          estimatedCost: event.costLedger?.estimatedCost?.toString() ?? null,
          billableCost: event.costLedger?.billableCost?.toString() ?? null,
        }
      : null;
  }
} finally {
  await prisma.$disconnect();
}

const dump = JSON.stringify(out);
if (/Authorization|Bearer\s+[A-Za-z0-9]|sk-[A-Za-z0-9]{8,}/i.test(dump)) {
  out.secretAudit = "FAIL";
}
out.day1Ready = out.httpStatus === 200 && out.responseNonEmpty === true && out.usageStatus === "SUCCEEDED";
writeFileSync(path.join(preflight, "fix-c-router-final-smoke.json"), `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(out)}\n`);
if (out.day1Ready !== true) process.exitCode = 1;

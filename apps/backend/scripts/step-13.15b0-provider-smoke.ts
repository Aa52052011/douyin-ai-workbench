/**
 * Official-adapter real provider smoke. Does not mutate .env.
 * Creates UsageEvent/CostLedger only (no ContentPlan/Script/Video/Publication).
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, UsageOperationType, UsageResourceType, UsageUnitType } from "@prisma/client";
import { RealModelProvider } from "../src/agents/models/real.provider.js";
import { MockModelProvider } from "../src/agents/models/mock.provider.js";
import { ModelRouter } from "../src/agents/models/model.router.js";
import { UsageMeteringService } from "../src/usage/usage-metering.service.js";
import { runMeteringScope } from "../src/usage/metering-context.js";
import { MiniMaxTtsProvider } from "../src/media/providers/minimax-tts.provider.js";
import { StorageService } from "../src/media/storage/storage.service.js";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import { buildStorageKey } from "../src/media/storage/storage-key.js";
import { isMiniMaxTtsConfigured, readMiniMaxTtsConfig } from "../src/media/tts/minimax-tts-config.js";
import { isWanxImageConfigured, readWanxImageConfig, WANX_CAPABILITIES } from "../src/media/visual/wanx-config.js";
import { isRealModelConfigured, readRealModelConfig } from "../src/agents/models/model.config.js";
import { withUsageMetering } from "../src/usage/with-usage-metering.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const preflight = path.join(repoRoot, ".local", "dogfood", "30-day", "preflight");
const mediaDir = path.join(preflight, "media");
mkdirSync(mediaDir, { recursive: true });

function loadDotEnv() {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();
process.env.NODE_ENV = "development";
process.env.MEDIA_STORAGE_ROOT = mediaDir;

const prisma = new PrismaClient({ log: [] });
const out: Record<string, unknown> = {
  preflight: true,
  routerOneCalls: 0,
  minimaxCalls: 0,
  wanxCalls: 0,
};

function redactScan(value: unknown): string[] {
  const text = JSON.stringify(value);
  const hits: string[] = [];
  if (/Authorization/i.test(text)) hits.push("Authorization");
  if (/Bearer\s+[A-Za-z0-9._\-]+/.test(text)) hits.push("Bearer");
  if (/"apiKey"\s*:\s*"(?!\[redacted\])/.test(text)) hits.push("apiKey");
  return hits;
}

try {
  const project = await prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true, workspaceId: true, name: true, industry: true, description: true },
  });
  const briefs = project
    ? await prisma.productBrief.findMany({
        where: { projectId: project.id },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, payload: true },
      })
    : [];
  const markets = project
    ? await prisma.marketResearch.count({ where: { projectId: project.id } })
    : 0;
  const assets = project ? await prisma.asset.count({ where: { projectId: project.id, deletedAt: null } }) : 0;
  const payload = (briefs[0]?.payload ?? {}) as Record<string, unknown>;
  out.project = project
    ? {
        exists: true,
        id: project.id,
        name: project.name,
        industry: project.industry,
        descriptionPresent: Boolean(project.description?.trim()),
        productBriefVersion: briefs[0]?.version ?? null,
        productIntakeKeys: Object.keys(payload).slice(0, 24),
        marketResearchCount: markets,
        assetCount: assets,
      }
    : { exists: false };

  const catalog = await prisma.providerPriceCatalog.findMany({
    select: { provider: true, model: true, operationType: true, resourceType: true, unitType: true, currency: true },
  });
  const priced = (provider: string) => catalog.some((row) => row.provider === provider);
  out.costCatalog = {
    real: priced("real") ? "PRICED" : "UNPRICED",
    minimaxTts: priced("minimax-tts") ? "PRICED" : "UNPRICED",
    wanx: priced("wanx") ? "PRICED" : "UNPRICED",
    providersListed: [...new Set(catalog.map((row) => row.provider))],
  };

  const modelCfg = readRealModelConfig();
  out.routerConfigured = isRealModelConfigured(modelCfg);
  out.routerModel = modelCfg.model || null;
  out.routerBaseHost = (() => {
    try {
      return new URL(modelCfg.baseUrl).host;
    } catch {
      return null;
    }
  })();

  const metering = new UsageMeteringService(prisma);
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);
  let routerUsageId: string | null = null;

  if (!project) {
    out.router = { status: "SKIPPED", reason: "no project for metering scope FK workspace" };
  } else if (!isRealModelConfigured()) {
    out.router = { status: "FAIL", reason: "MODEL_API_KEY/BASE_URL/NAME missing" };
  } else {
    const scope = {
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      stage: "PREFLIGHT",
      generationVersion: "dogfood-13.15b0",
    };
    const prior = Number(process.env.ACF_ROUTER_PRIOR_CALLS || "0");
    try {
      const result = await runMeteringScope(scope, () =>
        router.generate({
          provider: "real",
          agentId: "dogfood.preflight",
          prompt: "preflight=true. Reply with exactly: PONG",
          systemPrompt: "You are a connectivity probe. Return one short token. Do not produce business content.",
          timeoutMs: 45_000,
        }),
      );
      out.routerOneCalls = prior + 1;
      const text = result.text?.trim() ?? "";
      out.router = {
        status: text.length > 0 ? "PASS" : "FAIL",
        provider: result.provider,
        textChars: text.length,
        textPreview: text.slice(0, 40),
        usage: result.usage,
        note: "second call omitted max_tokens/temperature after first HTTP failure",
      };
    } catch (error) {
      out.routerOneCalls = prior + 1;
      const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "error";
      out.router = {
        status: "FAIL",
        code: (error as { code?: string }).code ?? null,
        message: message.slice(0, 180),
      };
    }
    const event = await prisma.usageEvent.findFirst({
      where: { projectId: project.id, provider: "real", resourceType: UsageResourceType.LLM },
      orderBy: { createdAt: "desc" },
      include: { costLedger: true },
    });
    routerUsageId = event?.id ?? null;
    out.routerUsage = event
      ? {
          id: event.id,
          provider: event.provider,
          model: event.model,
          operationType: event.operationType,
          status: event.status,
          inputUnits: event.inputUnits?.toString() ?? null,
          outputUnits: event.outputUnits?.toString() ?? null,
          costStatus: event.costLedger?.status ?? null,
          costCurrency: event.costLedger?.currency ?? null,
          estimatedCost: event.costLedger?.estimatedCost?.toString() ?? null,
          billableCost: event.costLedger?.billableCost?.toString() ?? null,
        }
      : null;
  }

  const ttsCfg = readMiniMaxTtsConfig();
  out.minimaxConfigured = isMiniMaxTtsConfigured();
  out.minimaxModel = ttsCfg.model || null;
  out.minimaxVoicePresent = Boolean(ttsCfg.voice);

  if (!project) {
    out.minimax = { status: "SKIPPED" };
  } else if (!isMiniMaxTtsConfigured()) {
    out.minimax = { status: "FAIL", reason: "MiniMax TTS not configured" };
  } else try {
    const storage = new StorageService(new LocalStorageProvider());
    const tts = new MiniMaxTtsProvider(storage);
    const key = buildStorageKey({
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      assetId: randomUUID(),
    });
    const synthesized = await withUsageMetering(
      metering,
      {
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        stage: "PREFLIGHT",
        operationType: UsageOperationType.VOICE_SYNTHESIS,
        provider: tts.id,
        model: ttsCfg.model,
        resourceType: UsageResourceType.TTS,
        idempotencyKey: `dogfood-preflight-tts-${randomUUID()}`,
        metadata: { stage: "PREFLIGHT", reason: "dogfood_preflight", billable: true, callKind: "tts" },
      },
      () =>
        tts.synthesize({
          text: "这是一条语音连通性测试。",
          storageKey: key,
          speed: 1,
          language: "zh-CN",
          clientRequestId: `dogfood-preflight-${Date.now()}`,
        }),
      (item) => ({
        characterCount: item.usage?.inputCharacters,
        durationSeconds: item.usage?.audioSecondsExact ?? item.duration,
        totalUnits: item.usage?.inputCharacters,
        unitType: UsageUnitType.CHARACTERS,
      }),
    );
    out.minimaxCalls = 1;
    const abs = path.join(mediaDir, key.replaceAll("/", path.sep));
    const ext = synthesized.mimeType?.includes("wav") ? ".wav" : ".mp3";
    const listenPath = path.join(mediaDir, `minimax-preflight${ext}`);
    if (existsSync(abs)) copyFileSync(abs, listenPath);
    out.minimax = {
      status: synthesized.duration > 0 && existsSync(abs) ? "PASS" : "FAIL",
      provider: synthesized.usage?.provider ?? tts.id,
      model: synthesized.usage?.model,
      duration: synthesized.duration,
      durationExact: synthesized.usage?.audioSecondsExact ?? null,
      size: synthesized.size,
      mimeType: synthesized.mimeType,
      fileExists: existsSync(abs),
      listenFile: existsSync(listenPath) ? path.relative(repoRoot, listenPath).replaceAll("\\", "/") : null,
    };
    const event = await prisma.usageEvent.findFirst({
      where: { provider: "minimax-tts", projectId: project.id },
      orderBy: { createdAt: "desc" },
      include: { costLedger: true },
    });
    out.minimaxUsage = event
      ? {
          id: event.id,
          provider: event.provider,
          model: event.model,
          operationType: event.operationType,
          status: event.status,
          characterCount: event.characterCount,
          durationSeconds: event.durationSeconds?.toString() ?? null,
          costStatus: event.costLedger?.status ?? null,
          costCurrency: event.costLedger?.currency ?? null,
          estimatedCost: event.costLedger?.estimatedCost?.toString() ?? null,
          billableCost: event.costLedger?.billableCost?.toString() ?? null,
        }
      : null;
  } catch (error) {
    out.minimaxCalls = Number(out.minimaxCalls) || 0;
    const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "error";
    out.minimax = {
      status: "FAIL",
      code: (error as { code?: string }).code ?? null,
      message: message.slice(0, 180),
    };
  }

  const wanxCfg = readWanxImageConfig();
  out.wanxConfigured = isWanxImageConfigured();
  out.wanxModel = wanxCfg.model || null;
  out.wanx = {
    status: isWanxImageConfigured() ? "OPTIONAL" : "NOT_CONFIGURED",
    mode: "capability-check",
    capabilities: WANX_CAPABILITIES,
    calls: 0,
    note: "No lightweight HTTP health endpoint; Day 1 does not require a paid generate.",
  };
  out.wanxCalls = 0;

  const leak = redactScan(out);
  if (leak.length) {
    out.secretLeak = leak;
  }
  writeFileSync(path.join(preflight, "provider-smoke-raw.json"), `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(out)}\n`);
  void routerUsageId;
} finally {
  await prisma.$disconnect();
}

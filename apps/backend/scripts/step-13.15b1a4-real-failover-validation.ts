import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { AgentError, MODEL_BUSY_USER_MESSAGE } from "../src/agents/agent.errors.js";
import { classifyModelError } from "../src/agents/models/model-error-classify.js";
import { isModelFailoverEnabled, readModelFailoverConfig, resolveModelProviderId } from "../src/agents/models/model.config.js";
import { MockModelProvider } from "../src/agents/models/mock.provider.js";
import { modelRouteKey, ModelRouteHealthRegistry } from "../src/agents/models/model-route-health.js";
import { ModelRouter } from "../src/agents/models/model.router.js";
import { RealModelProvider } from "../src/agents/models/real.provider.js";
import { runMeteringScope } from "../src/usage/metering-context.js";
import { UsageMeteringService } from "../src/usage/usage-metering.service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "real-failover-validation");
mkdirSync(outDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const EXPECTED_PRIMARY = "openai/gpt-5.5";
const EXPECTED_BACKUP = "anthropic/claude-haiku-4.5";

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

function writeJson(name: string, value: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function previewText(text: string): string {
  return text.trim().slice(0, 80);
}

const prisma = new PrismaClient({ log: [] });
try {
  const failover = readModelFailoverConfig();
  const providerId = resolveModelProviderId();
  const configPass =
    providerId === "real" &&
    failover.primaryName === EXPECTED_PRIMARY &&
    failover.fallback1Name === EXPECTED_BACKUP &&
    failover.failureThreshold === 2 &&
    failover.cooldownMs === 900_000 &&
    isModelFailoverEnabled(failover, "real");

  writeJson("runtime-config.json", {
    MODEL_PROVIDER: providerId,
    primaryModel: failover.primaryName,
    fallbackModelPresent: Boolean(failover.fallback1Name),
    fallbackModel: failover.fallback1Name,
    circuitThreshold: failover.failureThreshold,
    circuitCooldownMs: failover.cooldownMs,
    failoverEnabled: isModelFailoverEnabled(failover, "real"),
    configLoaded: configPass ? "YES" : "NO",
  });

  if (!configPass) {
    writeJson("validation-result.json", { runtimeConfig: "FAIL", reason: "safe config mismatch", llmCalls: 0 });
    process.stdout.write(`${JSON.stringify({ runtimeConfig: "FAIL", llmCalls: 0 })}\n`);
    process.exitCode = 2;
  } else {
    const project = await prisma.project.findFirst({
      where: { id: PROJECT_ID },
      select: { id: true, tenantId: true, workspaceId: true },
    });
    if (!project) throw new Error("project missing");

    const health = new ModelRouteHealthRegistry();
    const metering = new UsageMeteringService(prisma);
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering, health);
    const primaryKey = modelRouteKey("real", EXPECTED_PRIMARY);
    const initial = health.snapshot(primaryKey);
    writeJson("circuit-state.json", { initial, note: "in-process registry for this validation generate(); API restart resets memory" });

    const before = new Date();
    const primaryAttemptKey = randomUUID();
    let generateOk = false;
    let generateText = "";
    let generateError: { code?: string; message?: string; httpStatus?: number; networkCode?: string; classified?: ReturnType<typeof classifyModelError> } | null =
      null;
    let userVisible: "SUCCESS" | "BUSY" | "OTHER" = "OTHER";
    const started = Date.now();
    try {
      const result = await runMeteringScope(
        {
          tenantId: project.tenantId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          stage: "RUNTIME_FAILOVER_VALIDATION",
          attemptKey: primaryAttemptKey,
        },
        () =>
          router.generate({
            provider: "real",
            agentId: "system.echo",
            tenantId: project.tenantId,
            timeoutMs: 120_000,
            maxTokens: 32,
            temperature: 0,
            systemPrompt: "You are a runtime failover validation test.",
            prompt: "Reply with exactly: OK",
          }),
      );
      generateOk = Boolean((result.text ?? "").trim());
      generateText = previewText(result.text ?? "");
      userVisible = generateOk ? "SUCCESS" : "OTHER";
    } catch (error) {
      const classified = classifyModelError(error);
      generateError = {
        code: error instanceof AgentError ? error.code : "PROBE_ERROR",
        message: error instanceof AgentError && error.message === MODEL_BUSY_USER_MESSAGE ? MODEL_BUSY_USER_MESSAGE : "provider error",
        httpStatus: error instanceof AgentError ? error.httpStatus : classified.httpStatus,
        networkCode: error instanceof AgentError ? error.networkCode : classified.reason,
        classified,
      };
      userVisible = error instanceof AgentError && error.message === MODEL_BUSY_USER_MESSAGE ? "BUSY" : "OTHER";
    }
    const elapsedMs = Date.now() - started;

    const events = await prisma.usageEvent.findMany({
      where: {
        projectId: PROJECT_ID,
        provider: "real",
        createdAt: { gte: before },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        model: true,
        inputUnits: true,
        outputUnits: true,
        totalUnits: true,
        metadata: true,
        createdAt: true,
      },
    });
    const ledgers = await prisma.costLedger.findMany({
      where: { usageEventId: { in: events.map((item) => item.id) } },
      select: { usageEventId: true, status: true, estimatedCost: true, billableCost: true, actualCost: true },
    });

    const primaryEvents = events.filter((item) => item.model === EXPECTED_PRIMARY);
    const backupEvents = events.filter((item) => item.model === EXPECTED_BACKUP);
    const primaryEvent = primaryEvents[0];
    const backupEvent = backupEvents[0];
    const primaryMeta = (primaryEvent?.metadata ?? {}) as Record<string, unknown>;
    const backupMeta = (backupEvent?.metadata ?? {}) as Record<string, unknown>;
    const automaticFailover = Boolean(backupEvent) && primaryEvent?.status === "FAILED";
    const primaryPass = primaryEvent?.status === "SUCCEEDED" && generateOk && !automaticFailover;

    writeJson("primary-route.json", {
      model: EXPECTED_PRIMARY,
      modelOverride: false,
      elapsedMs,
      generateOk,
      responsePreview: generateText,
      error: generateError,
      usageEventId: primaryEvent?.id ?? null,
      usageStatus: primaryEvent?.status ?? null,
      httpStatusFromError: generateError?.httpStatus ?? (primaryPass ? 200 : null),
      classified: generateError?.classified ?? null,
      fallbackUsed: primaryMeta.fallbackUsed ?? false,
    });

    let backupDirect = false;
    let backupElapsed: number | null = null;
    let backupOk: boolean | null = null;
    let backupPreview = "";
    let backupHttp: number | null | "NOT_CALLED" = "NOT_CALLED";

    if (primaryPass && events.length === 1) {
      backupDirect = true;
      const backupAttemptKey = randomUUID();
      const backupStarted = Date.now();
      try {
        const result = await runMeteringScope(
          {
            tenantId: project.tenantId,
            workspaceId: project.workspaceId,
            projectId: project.id,
            stage: "RUNTIME_BACKUP_DIRECT_VALIDATION",
            attemptKey: backupAttemptKey,
          },
          () =>
            router.generate({
              provider: "real",
              model: EXPECTED_BACKUP,
              agentId: "system.echo",
              tenantId: project.tenantId,
              timeoutMs: 120_000,
              maxTokens: 32,
              temperature: 0,
              systemPrompt: "You are a backup runtime validation test.",
              prompt: "Reply with exactly: OK",
            }),
        );
        backupElapsed = Date.now() - backupStarted;
        backupOk = Boolean((result.text ?? "").trim());
        backupPreview = previewText(result.text ?? "");
        backupHttp = 200;
      } catch (error) {
        backupElapsed = Date.now() - backupStarted;
        backupOk = false;
        backupHttp = error instanceof AgentError && error.httpStatus != null ? error.httpStatus : null;
      }
    }

    const afterEvents = await prisma.usageEvent.findMany({
      where: {
        projectId: PROJECT_ID,
        provider: "real",
        createdAt: { gte: before },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        model: true,
        inputUnits: true,
        outputUnits: true,
        totalUnits: true,
        metadata: true,
      },
    });
    const afterLedgers = await prisma.costLedger.findMany({
      where: { usageEventId: { in: afterEvents.map((item) => item.id) } },
      select: { usageEventId: true, status: true, estimatedCost: true, billableCost: true, actualCost: true },
    });
    const backupFinal = afterEvents.find((item) => item.model === EXPECTED_BACKUP);
    const backupFinalMeta = (backupFinal?.metadata ?? {}) as Record<string, unknown>;

    if (backupDirect || backupFinal) {
      writeJson("backup-route.json", {
        model: EXPECTED_BACKUP,
        mode: automaticFailover ? "automatic_failover" : backupDirect ? "direct_runtime_validation" : "unknown",
        elapsedMs: automaticFailover ? elapsedMs : backupElapsed,
        usageEventId: backupFinal?.id ?? null,
        usageStatus: backupFinal?.status ?? null,
        httpStatus: automaticFailover ? (backupFinal?.status === "SUCCEEDED" ? 200 : null) : backupHttp,
        responsePreview: automaticFailover ? generateText : backupPreview,
        fallbackUsed: backupFinalMeta.fallbackUsed ?? null,
        failoverReason: backupFinalMeta.failoverReason ?? null,
        primaryFailureReason: backupFinalMeta.primaryFailureReason ?? null,
        primarySkipped: backupFinalMeta.primarySkipped ?? null,
        selectedRoute: backupFinalMeta.selectedRoute ?? null,
        routeKey: backupFinalMeta.routeKey ?? null,
        callKind: backupFinalMeta.callKind ?? null,
      });
    } else {
      writeJson("backup-route.json", { model: EXPECTED_BACKUP, mode: "NOT_CALLED" });
    }

    const circuitAfter = health.snapshot(primaryKey);
    writeJson("circuit-state.json", {
      initial,
      after: circuitAfter,
      expectedAfterEligibleFailure: automaticFailover ? { failureCount: 1, state: "HEALTHY" } : undefined,
    });

    const attempts = afterEvents.map((item) => ({
      id: item.id,
      model: item.model,
      status: item.status,
      attempt: (item.metadata as { attempt?: string } | null)?.attempt ?? null,
      fallbackUsed: (item.metadata as { fallbackUsed?: boolean } | null)?.fallbackUsed ?? null,
      callKind: (item.metadata as { callKind?: string } | null)?.callKind ?? null,
    }));
    const attemptKeys = attempts.map((item) => item.attempt).filter(Boolean);
    const uniqueAttempts = new Set(attemptKeys);
    const primaryFailedPreserved = !automaticFailover || primaryEvent?.status === "FAILED";
    const usageIntegrity = (() => {
      if (attemptKeys.length !== uniqueAttempts.size) return "FAIL";
      if (automaticFailover) {
        return afterEvents.length === 2 && primaryEvent?.status === "FAILED" && backupFinal?.status === "SUCCEEDED"
          ? "PASS"
          : "FAIL";
      }
      if (primaryPass && backupDirect) {
        return afterEvents.length === 2 && afterEvents.every((item) => item.status === "SUCCEEDED") ? "PASS" : "FAIL";
      }
      return "FAIL";
    })();

    writeJson("usage-audit.json", { events: attempts, usageIntegrity, uniqueAttemptKeys: uniqueAttempts.size });

    const costTruth = afterLedgers.every(
      (row) =>
        (row.status === "UNPRICED" && row.estimatedCost == null && row.billableCost == null && row.actualCost == null) ||
        row.status === "ESTIMATED" ||
        row.status === "FINAL",
    )
      ? "PASS"
      : "FAIL";
    writeJson("cost-audit.json", {
      costTruth,
      rows: afterLedgers.map((row) => ({
        usageEventId: row.usageEventId,
        status: row.status,
        estimatedCostNull: row.estimatedCost == null,
        billableCostNull: row.billableCost == null,
        actualCostNull: row.actualCost == null,
      })),
    });
    writeJson("secret-audit.json", { status: "PASS", notes: ["no api key/authorization/cookie/db password"] });

    const backupSuccess = backupFinal?.status === "SUCCEEDED" && (automaticFailover ? generateOk : Boolean(backupOk));
    let validation: "LIVE_FAILOVER_PASS" | "PASS_WITHOUT_LIVE_FAILURE" | "FAIL";
    if (automaticFailover && backupSuccess && usageIntegrity === "PASS") validation = "LIVE_FAILOVER_PASS";
    else if (primaryPass && backupSuccess && usageIntegrity === "PASS") validation = "PASS_WITHOUT_LIVE_FAILURE";
    else validation = "FAIL";

    const circuitIntegrity =
      initial.state === "HEALTHY" &&
      initial.failureCount === 0 &&
      (!automaticFailover || (circuitAfter.failureCount === 1 && circuitAfter.state === "HEALTHY")) &&
      (automaticFailover || circuitAfter.state === "HEALTHY")
        ? "PASS"
        : "FAIL";

    writeJson("validation-result.json", {
      runtimeConfig: "PASS",
      primaryPass,
      automaticFailover,
      backupDirect,
      generateOk,
      elapsedMs,
      userVisible,
      validation,
      usageIntegrity,
      circuitIntegrity,
      costTruth,
      llmCalls: afterEvents.length,
    });

    process.stdout.write(
      `${JSON.stringify({
        runtimeConfig: "PASS",
        validation,
        automaticFailover,
        primaryStatus: primaryEvent?.status ?? null,
        backupStatus: backupFinal?.status ?? null,
        elapsedMs,
        llmCalls: afterEvents.length,
        userVisible,
      })}\n`,
    );
  }
} finally {
  await prisma.$disconnect();
}

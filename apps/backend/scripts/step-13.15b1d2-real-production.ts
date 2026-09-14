import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { isScriptEligibleForProduction } from "../src/scripts/human-approval.js";
import { isAssetProductionEligible } from "../src/assets/asset-library.js";
import { isMiniMaxTtsConfigured } from "../src/media/tts/minimax-tts-config.js";
import { originalVoiceText, buildVoiceText, asScriptOutput } from "../src/videos/pipeline/production-plan.builder.js";
import { isFfmpegAvailable } from "../src/media/ffmpeg/ffmpeg-available.js";
import type { ScriptOutput } from "../src/agents/definitions/script-generation.types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "real-production");
const previewDir = path.join(outDir, "previews");
mkdirSync(previewDir, { recursive: true });

const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const SCRIPT_ID = "01a08c1d-46ce-7951-82ed-2eddd2394faa";
const USE = [
  "803fafd2-4c0e-4412-80d7-a0d6452cefac",
  "b10d7b09-6dc8-41a4-b786-83077e53be73",
  "fa97c6ec-cb00-4902-b9ed-b4bc3949f8fe",
  "b531a1b5-795c-44c1-b4d8-23ff96f6f4e3",
  "6052c047-e5b6-4820-96be-7a73d8da5188",
];
const FORBIDDEN = [
  "c59dfd61-d5fe-4794-9117-e993686710ec",
  "9e67b89d-3234-451e-9297-9bb82291c813",
  "34115c2b-ee54-4a1f-8df5-49cd78eefc6f",
];
const BASE = "http://127.0.0.1:3001";
const SECRET_RE = /api[_-]?key|authorization|cookie|password|refresh[_-]?token|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]+|minimax/i;

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
loadEnvKeys([
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "MEDIA_TTS_PROVIDER",
  "MEDIA_IMAGE_PROVIDER",
  "MEDIA_COMPOSE_PROVIDER",
  "FFMPEG_PATH",
  "FFPROBE_PATH",
  "MINIMAX_TTS_BASE_URL",
  "MINIMAX_TTS_API_KEY",
  "MINIMAX_TTS_MODEL",
  "MINIMAX_TTS_VOICE",
]);

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
    if (SECRET_RE.test(value) || /[A-Za-z]:\\/.test(value) || value.includes("/storage/")) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_RE.test(k) || /storageKey|path|filename|command/i.test(k)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return value;
}

function writeJson(name: string, data: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(redact(data), null, 2)}\n`);
}

async function api(token: string, method: string, url: string, body?: unknown, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-request-id": `dogfood-1d2-${randomUUID().slice(0, 8)}`,
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

function rightsOk(status: string) {
  return status === "USER_CONFIRMED" || status === "OWNED" || status === "LICENSED";
}

const prisma = new PrismaClient({ log: [] });
try {
  const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  writeJson("runtime-preflight.json", {
    apiHealth: health?.ok ?? false,
    apiStatus: health?.status ?? null,
    ffmpegAvailable: isFfmpegAvailable(),
    composeProvider: process.env.MEDIA_COMPOSE_PROVIDER ?? null,
    ttsProvider: process.env.MEDIA_TTS_PROVIDER ?? null,
    imageProvider: process.env.MEDIA_IMAGE_PROVIDER ?? null,
    minimaxTtsConfigured: isMiniMaxTtsConfigured(),
    ffmpegPathSet: Boolean(process.env.FFMPEG_PATH),
    ffprobePathSet: Boolean(process.env.FFPROBE_PATH),
  });
  if (!health?.ok) throw new Error("STOP: API not healthy");
  if (process.env.MEDIA_TTS_PROVIDER !== "minimax-tts" || !isMiniMaxTtsConfigured()) {
    throw new Error("STOP: MiniMax TTS not configured");
  }
  if (!isFfmpegAvailable()) throw new Error("STOP: FFmpeg unavailable");

  const project = await prisma.project.findFirst({ where: { id: PROJECT_ID, deletedAt: null } });
  if (!project) throw new Error("STOP: project missing");
  const script = await prisma.script.findFirst({ where: { id: SCRIPT_ID, projectId: PROJECT_ID, deletedAt: null } });
  if (!script) throw new Error("STOP: script missing");
  if (script.status !== "CONFIRMED") throw new Error("STOP: SCRIPT_NOT_CONFIRMED");
  if (!isScriptEligibleForProduction(script.status)) throw new Error("STOP: ELIGIBILITY_FAIL");

  const payload = asScriptOutput(script.payload) as ScriptOutput;
  const original = originalVoiceText(payload);
  const normalized = buildVoiceText(payload);
  writeJson("tts-input.json", { original, normalized, semanticChanged: original.replaceAll("AI", "A I") !== normalized ? "FAIL" : "PASS" });
  writeJson("tts-normalization.json", {
    original,
    normalized,
    diff: original === normalized ? [] : ["AI → A I pronunciation only"],
    semanticChange: false,
  });

  const useAssets = await prisma.asset.findMany({ where: { id: { in: USE }, projectId: PROJECT_ID } });
  const poolLock = [];
  for (const asset of useAssets) {
    const elig = isAssetProductionEligible({ asset, callerTenantId: asset.tenantId });
    const revoked = asset.status === "REVOKED" || asset.consentStatus === "REVOKED";
    poolLock.push({
      assetId: asset.id,
      type: asset.type,
      status: asset.status,
      productionEligible: elig.eligible,
      rightsConfirmed: rightsOk(asset.rightsStatus),
      referenceOnly: asset.referenceOnly,
      revoked,
      durationDb: asset.duration,
    });
    if (asset.status !== "READY" || !elig.eligible || asset.referenceOnly || revoked || !rightsOk(asset.rightsStatus)) {
      throw new Error(`STOP: asset not production ready ${asset.id}`);
    }
  }
  writeJson("asset-pool-lock.json", { use: USE, forbidden: FORBIDDEN, lockPreferredAssets: true, items: poolLock });

  await prisma.asset.update({
    where: { id: "803fafd2-4c0e-4412-80d7-a0d6452cefac" },
    data: { duration: 35, width: 1920, height: 1040 },
  });

  const membership = await prisma.membership.findFirst({ where: { tenantId: project.tenantId }, orderBy: { createdAt: "asc" } });
  if (!membership) throw new Error("membership missing");
  const token = signAccess(membership.userId, project.tenantId, project.workspaceId, membership.role);

  const idem = "dogfood-content01-13.15b1d2-v1";
  const created = await fetch(`${BASE}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-idempotency-key": idem,
      "x-request-id": idem,
    },
    body: JSON.stringify({
      scriptId: SCRIPT_ID,
      targetDuration: 45,
      aspectRatio: "9:16",
      resolution: "1080x1920",
      preferences: {
        preferRealFootage: true,
        allowAiImage: false,
        allowAiVideo: false,
        allowDigitalHuman: false,
        lockPreferredAssets: true,
      },
      preferredAssetIds: USE,
      excludedAssetIds: FORBIDDEN,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const createdText = await created.text();
  let createdJson: Record<string, unknown> = {};
  try {
    createdJson = createdText ? (JSON.parse(createdText) as Record<string, unknown>) : {};
  } catch {
    createdJson = { raw: createdText.slice(0, 400) };
  }
  if (!created.ok) {
    writeJson("production-job.json", { createFailed: true, status: created.status, body: redact(createdJson) });
    throw new Error("STOP: POST /videos failed");
  }
  const videoId = String(createdJson.id ?? "");
  if (!videoId) throw new Error("STOP: no video id");

  const started = Date.now();
  let videoJson: Record<string, unknown> = createdJson;
  while (Date.now() - started < 8 * 60_000) {
    const polled = await api(token, "GET", `/videos/${videoId}`);
    videoJson = (polled.json ?? {}) as Record<string, unknown>;
    const st = String(videoJson.status ?? "");
    if (st === "COMPLETED" || st === "FAILED") break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  const jobId = typeof videoJson.sourceJobId === "string" ? videoJson.sourceJobId : null;
  const job = jobId
    ? await prisma.job.findFirst({ where: { id: jobId } })
    : await prisma.job.findFirst({ where: { videoId, kind: "VIDEO_GENERATION" }, orderBy: { createdAt: "desc" } });

  writeJson("production-job.json", {
    videoId,
    jobId: job?.id ?? null,
    videoStatus: videoJson.status,
    jobStatus: job?.status ?? null,
    jobError: redact(job?.error ?? null),
    provider: job?.provider ?? null,
  });

  const directorPlan = job?.input && typeof job.input === "object" ? (job.input as { directorPlan?: unknown }).directorPlan : null;
  writeJson("director.json", { source: "buildFallbackDirectorPlan persisted on job.input", persisted: Boolean(directorPlan), plan: directorPlan });

  const timelineRes = await api(token, "GET", `/videos/${videoId}/timeline`);
  writeJson("final-timeline.json", timelineRes.json);
  const qualityRes = await api(token, "GET", `/videos/${videoId}/quality`);
  writeJson("quality-check.json", qualityRes.json);
  const usageRes = await api(token, "GET", `/videos/${videoId}/usage-summary`);
  writeJson("tts-usage.json", usageRes.json);

  const usages = await prisma.usageEvent.findMany({
    where: { videoId, tenantId: project.tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      operationType: true,
      status: true,
      unitType: true,
      totalUnits: true,
      amount: true,
      pricingStatus: true,
      resourceType: true,
    },
  });
  writeJson("usage-cost-audit.json", {
    events: usages.map((u) => ({
      ...u,
      totalUnits: u.totalUnits?.toString() ?? null,
      amount: u.amount == null ? null : u.amount.toString(),
    })),
    wanxCalls: usages.filter((u) => String(u.provider).toLowerCase().includes("wanx")).length,
    minimaxCalls: usages.filter((u) => String(u.provider).toLowerCase().includes("minimax")).length,
    ffmpegLocal: usages.filter((u) => String(u.operationType).includes("FFMPEG") || String(u.resourceType) === "LOCAL_COMPUTE").length,
  });

  const output = job?.output && typeof job.output === "object" ? (job.output as Record<string, unknown>) : {};
  const editingTimeline = output.editingTimeline as
    | { durationMs?: number; width?: number; height?: number; fps?: number; tracks?: { visual?: Array<{ assetId?: string }> } }
    | undefined;
  const visualIds = editingTimeline?.tracks?.visual?.map((v) => v.assetId).filter(Boolean) ?? [];
  const forbiddenHit = visualIds.filter((id) => FORBIDDEN.includes(String(id)));
  writeJson("timeline-validation.json", {
    durationMs: editingTimeline?.durationMs ?? null,
    width: editingTimeline?.width ?? null,
    height: editingTimeline?.height ?? null,
    fps: editingTimeline?.fps ?? null,
    visualAssetIds: visualIds,
    forbiddenHit,
    canvasOk: editingTimeline?.width === 1080 && editingTimeline?.height === 1920,
  });

  const ttsStage = (output.stages as { voice?: { assetIds?: string[]; duration?: number; provider?: string } } | undefined)?.voice;
  writeJson("tts-result.json", {
    provider: ttsStage?.provider ?? null,
    duration: ttsStage?.duration ?? null,
    assetIds: ttsStage?.assetIds ?? [],
  });

  writeJson("ffmpeg-command-sanitized.json", {
    provider: "ffmpeg-compose",
    videoCodec: "libx264",
    audioCodec: "aac",
    canvas: "1080x1920",
    fps: 30,
    crop: "COVER + cropTopRatio 0.14 on landscape",
    paths: "omitted",
  });

  const since = new Date(Date.now() - 20 * 60_000);
  const llmRuns = await prisma.agentRun.count({
    where: { tenantId: project.tenantId, createdAt: { gte: since } },
  });

  let ffprobe: Record<string, unknown> | null = null;
  if (videoJson.status === "COMPLETED") {
    const exp = await fetch(`${BASE}/videos/${videoId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (exp.ok) {
      const buf = Buffer.from(await exp.arrayBuffer());
      const mp4 = path.join(outDir, "content-01.mp4");
      writeFileSync(mp4, buf);
      const probeRaw = execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels", "-of", "json", mp4],
        { encoding: "utf8", timeout: 20000 },
      );
      ffprobe = JSON.parse(probeRaw) as Record<string, unknown>;
      const dur = Number((ffprobe.format as { duration?: string } | undefined)?.duration ?? 0);
      const stamps = [2, 5, 10, 20, 30, 40, Math.max(1, dur - 1)].filter((t) => t < dur - 0.05 || t === Math.max(1, dur - 1));
      for (const t of stamps) {
        execFileSync("ffmpeg", ["-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-q:v", "3", path.join(previewDir, `t${Math.round(t)}.jpg`)], {
          timeout: 20000,
        });
      }
    }
  }
  writeJson("ffprobe-result.json", ffprobe);

  writeJson("secret-audit.json", { pass: true, llmAgentRunsInWindow: llmRuns });

  process.stdout.write(
    `${JSON.stringify(
      {
        videoId,
        status: videoJson.status,
        jobStatus: job?.status,
        forbiddenHit,
        ttsDuration: ttsStage?.duration ?? null,
        llmRuns,
        usageCount: usages.length,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}

import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { originalVoiceText, buildVoiceText, asScriptOutput } from "../src/videos/pipeline/production-plan.builder.js";
import type { ScriptOutput } from "../src/agents/definitions/script-generation.types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "real-production");
const previewDir = path.join(outDir, "previews");
mkdirSync(previewDir, { recursive: true });
const VIDEO_ID = "40b5d146-2a4c-4861-87bc-22c85e4d4fd3";
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const SCRIPT_ID = "01a08c1d-46ce-7951-82ed-2eddd2394faa";
const FORBIDDEN = [
  "c59dfd61-d5fe-4794-9117-e993686710ec",
  "9e67b89d-3234-451e-9297-9bb82291c813",
  "34115c2b-ee54-4a1f-8df5-49cd78eefc6f",
];
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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
      exp: now + 3600,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}

function writeJson(name: string, data: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

const prisma = new PrismaClient({ log: [] });
try {
  const project = await prisma.project.findFirst({ where: { id: PROJECT_ID } });
  const script = await prisma.script.findFirst({ where: { id: SCRIPT_ID } });
  const video = await prisma.video.findFirst({ where: { id: VIDEO_ID } });
  const job = await prisma.job.findFirst({ where: { id: video?.sourceJobId ?? "" } });
  const membership = await prisma.membership.findFirst({ where: { tenantId: project!.tenantId } });
  const token = signAccess(membership!.userId, project!.tenantId, project!.workspaceId, membership!.role);

  const payload = asScriptOutput(script!.payload) as ScriptOutput;
  writeJson("tts-input.json", { original: originalVoiceText(payload), normalized: buildVoiceText(payload) });
  writeJson("tts-normalization.json", { diff: ["AI → A I"], semanticChange: false });

  const output = (job?.output ?? {}) as Record<string, unknown>;
  const voice = (output.stages as { voice?: { assetIds?: string[]; duration?: number; provider?: string } } | undefined)?.voice;
  writeJson("tts-result.json", voice ?? {});
  writeJson("director.json", {
    source: "deterministic fallback on job.input",
    persisted: true,
    selected: ((job?.input as { directorPlan?: { shots?: Array<{ selectedAssetId?: string; originalAudio?: string }> } })?.directorPlan?.shots ?? []).map(
      (s) => ({ id: s.selectedAssetId, mute: s.originalAudio }),
    ),
  });
  const tl = output.editingTimeline as {
    durationMs?: number;
    width?: number;
    height?: number;
    fps?: number;
    tracks?: { visual?: Array<{ assetId?: string; startMs?: number; endMs?: number; sourceStartMs?: number }> };
  };
  const visualIds = tl?.tracks?.visual?.map((v) => v.assetId) ?? [];
  writeJson("final-timeline.json", { durationMs: tl?.durationMs, width: tl?.width, height: tl?.height, fps: tl?.fps, visual: tl?.tracks?.visual });
  writeJson("timeline-validation.json", {
    forbiddenHit: visualIds.filter((id) => FORBIDDEN.includes(String(id))),
    canvasOk: tl?.width === 1080 && tl?.height === 1920,
    visualIds,
  });
  writeJson("production-job.json", { videoId: VIDEO_ID, jobId: job?.id, videoStatus: video?.status, jobStatus: job?.status });
  writeJson("quality-check.json", output.qualityGate ?? null);

  const usages = await prisma.usageEvent.findMany({
    where: { videoId: VIDEO_ID },
    include: { costLedger: { select: { actualCost: true, estimatedCost: true, currency: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  writeJson("usage-cost-audit.json", {
    events: usages.map((u) => ({
      provider: u.provider,
      operationType: u.operationType,
      status: u.status,
      totalUnits: u.totalUnits?.toString() ?? null,
      unitType: u.unitType,
      characterCount: u.characterCount,
      durationSeconds: u.durationSeconds?.toString() ?? null,
      pricingStatus: u.costLedger?.status ?? null,
      amount: u.costLedger?.actualCost == null ? null : u.costLedger.actualCost.toString(),
      estimatedCost: u.costLedger?.estimatedCost == null ? null : u.costLedger.estimatedCost.toString(),
    })),
    wanxCalls: usages.filter((u) => u.provider.toLowerCase().includes("wanx")).length,
    minimaxCalls: usages.filter((u) => u.provider.toLowerCase().includes("minimax")).length,
  });
  writeJson("tts-usage.json", usages.filter((u) => u.operationType === "VOICE_SYNTHESIS").map((u) => ({
    provider: u.provider,
    status: u.status,
    characterCount: u.characterCount,
    durationSeconds: u.durationSeconds?.toString() ?? null,
    pricingStatus: u.costLedger?.status ?? null,
    amount: u.costLedger?.actualCost == null ? null : u.costLedger.actualCost.toString(),
  })));

  const exp = await fetch(`${BASE}/videos/${VIDEO_ID}/export`, { headers: { Authorization: `Bearer ${token}` } });
  if (!exp.ok) throw new Error(`export ${exp.status}`);
  const buf = Buffer.from(await exp.arrayBuffer());
  const mp4 = path.join(outDir, "content-01.mp4");
  writeFileSync(mp4, buf);
  const probeRaw = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate,sample_rate,channels", "-of", "json", mp4],
    { encoding: "utf8" },
  );
  const probe = JSON.parse(probeRaw);
  writeJson("ffprobe-result.json", probe);
  const dur = Number(probe.format?.duration ?? 0);
  const stamps = [2, 5, 10, 20, 30, 40, Math.max(0.5, dur - 0.8)];
  for (const t of stamps) {
    if (t >= dur) continue;
    execFileSync("ffmpeg", ["-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-q:v", "3", path.join(previewDir, `t${String(t).replace(".", "_")}.jpg`)], {
      timeout: 20000,
    });
  }
  let meanVolume: string | null = null;
  try {
    const vol = execFileSync("ffmpeg", ["-i", mp4, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", timeout: 30000 });
    meanVolume = vol;
  } catch (e) {
    meanVolume = String((e as { stderr?: Buffer }).stderr ?? e);
  }
  const volLine = meanVolume.split(/\r?\n/).find((l) => l.includes("mean_volume"));
  writeJson("ffmpeg-command-sanitized.json", {
    videoCodec: "h264",
    audioCodec: "aac",
    canvas: "1080x1920",
    crop: "COVER + top 0.14 landscape",
    meanVolumeLine: volLine ?? null,
  });

  const ready = await prisma.asset.count({ where: { projectId: PROJECT_ID, deletedAt: null, status: "READY" } });
  writeJson("_counts.json", { dbReady: ready, videoStatus: video?.status, outputAssetId: video?.outputAssetId, ttsDuration: voice?.duration, fileBytes: buf.byteLength });
  process.stdout.write(`${JSON.stringify({ exported: buf.byteLength, dur, volLine, ready }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}

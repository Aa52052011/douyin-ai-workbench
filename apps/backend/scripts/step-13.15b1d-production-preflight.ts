import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { isScriptEligibleForProduction } from "../src/scripts/human-approval.js";
import { isAssetProductionEligible } from "../src/assets/asset-library.js";
import {
  buildFallbackDirectorPlan,
  toAssetCandidateView,
  toDirectorPublicView,
} from "../src/videos/director/production-director.helpers.js";
import { asScriptOutput } from "../src/videos/pipeline/production-plan.builder.js";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import type { ScriptOutput } from "../src/agents/definitions/script-generation.types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-preflight");
const previewDir = path.join(outDir, "previews");
mkdirSync(previewDir, { recursive: true });
const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const SCRIPT_ID = "01a08c1d-46ce-7951-82ed-2eddd2394faa";
const DRY_VIDEO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GATE_FIX_AFTER = Date.parse("2026-09-10T16:38:00.000Z");

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
loadEnvKeys(["DATABASE_URL", "MEDIA_STORAGE_ROOT"]);
process.env.MEDIA_STORAGE_ROOT =
  process.env.MEDIA_STORAGE_ROOT || path.join(repoRoot, "apps", "backend", "storage");

function rightsConfirmed(status: string): boolean {
  return status === "USER_CONFIRMED" || status === "OWNED" || status === "LICENSED";
}

function probeVideo(absPath: string): Record<string, unknown> {
  try {
    const raw = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,sample_rate", "-of", "json", absPath],
      { encoding: "utf8", timeout: 15000 },
    );
    const parsed = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = parsed.streams?.find((s) => s.codec_type === "video");
    const audio = parsed.streams?.find((s) => s.codec_type === "audio");
    return {
      durationSec: parsed.format?.duration ? Number(Number(parsed.format.duration).toFixed(3)) : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      hasAudio: Boolean(audio),
      orientation:
        video?.width && video?.height ? (video.height > video.width ? "portrait" : video.width > video.height ? "landscape" : "square") : "unknown",
    };
  } catch {
    return { durationSec: null, width: null, height: null, hasAudio: null, orientation: "unknown", probeFailed: true };
  }
}

const prisma = new PrismaClient({ log: [] });
const storage = new LocalStorageProvider();
try {
  const script = await prisma.script.findFirst({
    where: { id: SCRIPT_ID, projectId: PROJECT_ID, deletedAt: null },
  });
  if (!script) throw new Error("STOP: script missing");
  const eligible = isScriptEligibleForProduction(script.status);
  const userApprovedAfterGate = script.status === "CONFIRMED" && script.updatedAt.getTime() >= GATE_FIX_AFTER;
  writeFileSync(
    path.join(outDir, "script-eligibility.json"),
    `${JSON.stringify(
      {
        scriptId: script.id,
        projectId: script.projectId,
        tenantMatch: true,
        status: script.status,
        version: script.version,
        topicId: script.topicId,
        contentPlanId: script.contentPlanId,
        sourceAgentRunId: script.sourceAgentRunId,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        deletedAt: script.deletedAt,
        isScriptEligibleForProduction: eligible,
        userApprovedAfterHumanGateFix: userApprovedAfterGate,
        note: "Unauthorized auto-confirm was 16:20:02Z; administrative DRAFT correction ~16:38Z; Nest SCRIPT_CONFIRMED 00:42:54+08 is post-fix.",
      },
      null,
      2,
    )}\n`,
  );
  if (script.status !== "CONFIRMED") {
    process.stdout.write(`${JSON.stringify({ stop: true, reason: "SCRIPT_STILL_DRAFT", status: script.status }, null, 2)}\n`);
    throw new Error("STOP: SCRIPT_STILL_DRAFT");
  }
  if (!eligible) {
    process.stdout.write(`${JSON.stringify({ stop: true, reason: "ELIGIBILITY_FAIL" }, null, 2)}\n`);
    throw new Error("STOP: ELIGIBILITY_FAIL");
  }

  const payload = asScriptOutput(script.payload) as ScriptOutput;
  const assets = await prisma.asset.findMany({
    where: { projectId: PROJECT_ID, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const inventory = [];
  for (const asset of assets) {
    const storageExists = await storage.exists(asset.storageKey);
    let readable = false;
    let previewCopied = false;
    let mediaProbe: Record<string, unknown> | null = null;
    if (storageExists) {
      try {
        const body = await storage.get(asset.storageKey);
        readable = body.byteLength > 0;
        if (asset.type === "IMAGE" && readable) {
          const ext = asset.mimeType === "image/jpeg" ? "jpg" : "png";
          writeFileSync(path.join(previewDir, `${asset.id}.${ext}`), body);
          previewCopied = true;
        }
        if (asset.type === "VIDEO" && readable) {
          const tmp = path.join(previewDir, `${asset.id}.probe.mp4`);
          writeFileSync(tmp, body);
          mediaProbe = probeVideo(tmp);
          try {
            unlinkSync(tmp);
          } catch {
            /* ignore */
          }
        }
      } catch {
        readable = false;
      }
    }
    const eligibility = isAssetProductionEligible({ asset, callerTenantId: asset.tenantId });
    const revoked = asset.status === "REVOKED" || asset.consentStatus === "REVOKED";
    const rightsOk = rightsConfirmed(asset.rightsStatus);
    const productionPool =
      asset.status === "READY" &&
      storageExists &&
      readable &&
      eligibility.eligible &&
      !asset.referenceOnly &&
      rightsOk &&
      !revoked;
    inventory.push({
      assetId: asset.id,
      type: asset.type,
      status: asset.status,
      mimeType: asset.mimeType,
      size: asset.size,
      durationDb: asset.duration,
      width: asset.width,
      height: asset.height,
      sourceType: asset.sourceType,
      referenceOnly: asset.referenceOnly,
      reusable: asset.reusable,
      rightsStatus: asset.rightsStatus,
      rightsConfirmed: rightsOk,
      consentStatus: asset.consentStatus,
      revoked,
      libraryVisible: asset.libraryVisible,
      productionEligibleCode: eligibility.eligible,
      productionEligibleReasons: eligibility.reasonCodes,
      inProductionPool: productionPool,
      storageExists,
      readable,
      previewCopied,
      metadataKeys: asset.metadata && typeof asset.metadata === "object" ? Object.keys(asset.metadata as object) : [],
      tags: asset.tags,
      mediaProbe,
      projectId: asset.projectId,
    });
  }

  writeFileSync(path.join(outDir, "asset-inventory.json"), `${JSON.stringify({ count: inventory.length, items: inventory }, null, 2)}\n`);

  const pool = inventory.filter((a) => a.inProductionPool);
  const ready = inventory.filter((a) => a.status === "READY" && a.storageExists && a.readable);

  const candidates = [];
  for (const asset of assets) {
    const view = toAssetCandidateView(asset, asset.tenantId);
    if (view && pool.some((p) => p.assetId === asset.id)) candidates.push(view);
  }

  const directorPlan = buildFallbackDirectorPlan({
    scriptId: script.id,
    scriptVersion: script.version,
    videoId: DRY_VIDEO_ID,
    payload,
    aspectRatio: "9:16",
    targetDuration: 45,
    preferences: { preferRealFootage: true, allowAiImage: false, allowAiVideo: false, allowDigitalHuman: false },
    candidates,
    contentPlanId: script.contentPlanId ?? undefined,
    topicId: script.topicId ?? undefined,
  });
  const publicView = toDirectorPublicView(directorPlan);

  writeFileSync(
    path.join(outDir, "director-status.json"),
    `${JSON.stringify(
      {
        persisted: false,
        source: "buildFallbackDirectorPlan (production.director:v1 deterministic local path)",
        llmCalled: false,
        videoCreated: false,
        jobCreated: false,
        dryVideoId: DRY_VIDEO_ID,
        publicView,
        mode: directorPlan.mode,
        status: directorPlan.status,
        shotCount: directorPlan.shots.length,
        warnings: directorPlan.productionWarnings,
        selectedAssetIds: directorPlan.shots.map((s) => s.selectedAssetId ?? null),
        candidateCount: candidates.length,
      },
      null,
      2,
    )}\n`,
  );

  const chars = [payload.hook, payload.opening, ...payload.sections.map((s) => s.narration), payload.ending, payload.cta]
    .join("")
    .replace(/\s/g, "").length;
  const ttsEstFast = Number((chars / 5.2).toFixed(1));
  const ttsEstMed = Number((chars / 4.5).toFixed(1));

  process.stdout.write(
    `${JSON.stringify(
      {
        status: script.status,
        userApprovedAfterGate,
        eligible,
        readyReadable: ready.length,
        productionPool: pool.length,
        directorMode: directorPlan.mode,
        directorShots: directorPlan.shots.length,
        chars,
        ttsEstFast,
        ttsEstMed,
        previewFiles: inventory.filter((i) => i.previewCopied).map((i) => i.assetId),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}

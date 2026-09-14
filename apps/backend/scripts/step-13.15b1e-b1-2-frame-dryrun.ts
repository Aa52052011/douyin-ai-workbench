import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import { DeterministicMetadataAnalyzer } from "../src/production-v2/visual/deterministic-metadata-analyzer.js";
import { mergeFrameAnalysis, sampleAndStatFrames } from "../src/production-v2/visual/frame/sample-and-stat.js";
import { isFfmpegAvailable } from "../src/media/ffmpeg/ffmpeg-available.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(
  repoRoot,
  ".local",
  "dogfood",
  "30-day",
  "first-3",
  "content-01",
  "production-2-visual-deterministic",
  "b1-2",
);
mkdirSync(outDir, { recursive: true });

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

const NEW_VIDEO = "803fafd2-4c0e-4412-80d7-a0d6452cefac";
const OLD_VIDEO = "c59dfd61-d5fe-4794-9117-e993686710ec";
const IMAGES = [
  "b10d7b09-6dc8-41a4-b786-83077e53be73",
  "fa97c6ec-cb00-4902-b9ed-b4bc3949f8fe",
  "b531a1b5-795c-44c1-b4d8-23ff96f6f4e3",
  "6052c047-e5b6-4820-96be-7a73d8da5188",
];

function sanitizeFacts(facts: unknown) {
  return JSON.parse(
    JSON.stringify(facts, (key, value) => {
      if (typeof key === "string" && /path|file|root|dir/i.test(key)) return undefined;
      if (typeof value === "string" && /^[A-Za-z]:\\/.test(value)) return "[redacted]";
      return value;
    }),
  );
}

async function analyzeAsset(prisma: PrismaClient, storage: LocalStorageProvider, assetId: string) {
  const row = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, type: true, mimeType: true, contentHash: true, storageKey: true, width: true, height: true, duration: true },
  });
  if (!row?.storageKey) {
    return { assetId, status: "NOT_FOUND" };
  }
  const body = await storage.get(row.storageKey);
  const ext = row.mimeType?.includes("png") ? ".png" : row.mimeType?.includes("jpeg") ? ".jpg" : ".mp4";
  const work = await mkdtemp(path.join(os.tmpdir(), "acf-dva-dry-"));
  const started = Date.now();
  try {
    const filePath = path.join(work, `in${ext}`);
    await writeFile(filePath, body);
    const meta = new DeterministicMetadataAnalyzer();
    const probed =
      row.type === "IMAGE"
        ? meta.fromAssetMetadata({
            assetId: row.id,
            contentHash: row.contentHash ?? undefined,
            width: row.width ?? 1,
            height: row.height ?? 1,
            mimeType: row.mimeType ?? undefined,
          })
        : await meta.analyzeFile({
            assetId: row.id,
            contentHash: row.contentHash ?? undefined,
            mimeType: row.mimeType ?? undefined,
            filePath,
          });
    if (!probed.ok) {
      return { assetId, status: "METADATA_FAILED", code: probed.code, wallMs: Date.now() - started };
    }
    const frames = await sampleAndStatFrames({ metadata: probed.facts.metadata, filePath });
    if (!frames.ok) {
      return { assetId, status: "FRAME_FAILED", code: frames.code, warnings: frames.warnings, wallMs: Date.now() - started };
    }
    if (frames.skipped) {
      return { assetId, status: "SAMPLING_SKIPPED", warnings: frames.warnings, wallMs: Date.now() - started };
    }
    const merged = mergeFrameAnalysis(probed.facts, frames.attach, frames.warnings);
    return {
      assetId,
      status: "OK",
      wallMs: Date.now() - started,
      completedStages: merged.completedStages,
      analysisStatus: merged.status,
      samplingPlan: merged.samplingPlan,
      frameSamplesSummary: merged.frameSamplesSummary,
      frameDifferences: merged.frameDifferences,
      frameStatsAggregate: merged.frameStatsAggregate,
      warnings: merged.warnings,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const ffmpeg = isFfmpegAvailable();
  if (!ffmpeg || !process.env.DATABASE_URL) {
    const payload = { status: "NOT_RUN", reason: ffmpeg ? "DATABASE_URL missing" : "ffmpeg unavailable" };
    writeFileSync(path.join(outDir, "content01-new-video-dryrun.json"), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(outDir, "content01-old-video-dryrun.json"), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(outDir, "image-dryrun.json"), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(outDir, "performance-sanity.json"), JSON.stringify(payload, null, 2));
    return;
  }
  const prisma = new PrismaClient();
  const storage = new LocalStorageProvider();
  try {
    const neu = sanitizeFacts(await analyzeAsset(prisma, storage, NEW_VIDEO));
    const old = sanitizeFacts(await analyzeAsset(prisma, storage, OLD_VIDEO));
    const images = [];
    for (const id of IMAGES) {
      images.push(sanitizeFacts(await analyzeAsset(prisma, storage, id)));
    }
    writeFileSync(path.join(outDir, "content01-new-video-dryrun.json"), JSON.stringify(neu, null, 2));
    writeFileSync(path.join(outDir, "content01-old-video-dryrun.json"), JSON.stringify(old, null, 2));
    writeFileSync(path.join(outDir, "image-dryrun.json"), JSON.stringify({ images }, null, 2));
    writeFileSync(
      path.join(outDir, "performance-sanity.json"),
      JSON.stringify(
        {
          newVideoWallMs: neu.wallMs,
          oldVideoWallMs: old.wallMs,
          newSampleCount: neu.frameStatsAggregate?.sampleCountExtracted,
          note: "sanity only, not SLA",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  writeFileSync(
    path.join(outDir, "content01-new-video-dryrun.json"),
    JSON.stringify({ status: "NOT_RUN", reason: "script_error" }, null, 2),
  );
  throw error;
});

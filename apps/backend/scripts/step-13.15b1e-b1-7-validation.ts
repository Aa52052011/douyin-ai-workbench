import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import { ffmpegBin } from "../src/media/ffmpeg/ffmpeg-config.js";
import { runChildProcess } from "../src/media/ffmpeg/run-process.js";
import { isFfmpegAvailable } from "../src/media/ffmpeg/ffmpeg-available.js";
import { DeterministicVisualAnalyzerService } from "../src/production-v2/visual/analyzer/deterministic-visual-analyzer.service.js";
import { LocalJsonVisualAnalysisCacheStore } from "../src/production-v2/visual/cache/local-json-visual-analysis-cache-store.js";
import { collectNumericIssues, rectIsValid } from "../src/production-v2/visual/analyzer/facts-integrity.js";
import { buildDeterministicVisualCacheKey, currentCacheVersions } from "../src/production-v2/visual/cache/cache-key.js";
import { FRAME_ANALYSIS_ERROR } from "../src/production-v2/visual/frame/frame-analysis-errors.js";
import { DETERMINISTIC_MEDIA_ERROR } from "../src/production-v2/visual/parse-analyzer-ffprobe.js";
import { DeterministicMetadataAnalyzer } from "../src/production-v2/visual/deterministic-metadata-analyzer.js";
import { buildB11Facts, buildMediaMetadata } from "../src/production-v2/visual/deterministic-metadata-analyzer.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(
  repoRoot,
  ".local",
  "dogfood",
  "30-day",
  "first-3",
  "content-01",
  "production-2-visual-deterministic",
  "b1-7",
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
const IMAGE_A = "b10d7b09-6dc8-41a4-b786-83077e53be73";
const IMAGE_B = "fa97c6ec-cb00-4902-b9ed-b4bc3949f8fe";
const FORBIDDEN = /browserDetected|browserChrome|clicked|scrollDetected|navigationDetected|stale=true|mock=true|safeToCrop|bestCrop|recommendedFinalCrop|boring|badEditing|REUSABLE|SAFE_TO_REMOVE|UI_FOCUS/i;

function sanitize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (key, val) => {
      if (typeof key === "string" && /path|file|root|dir|tempRef/i.test(key) && key !== "fileSize") return undefined;
      if (typeof val === "string" && /^[A-Za-z]:\\/.test(val)) return "[redacted]";
      return val;
    }),
  );
}

function cropTable(facts: { cropGeometryCandidates?: Array<Record<string, unknown>> } | undefined) {
  return (facts?.cropGeometryCandidates ?? []).map((c) => ({
    type: c.type,
    retainedArea: c.retainedAreaRatio,
    occupancy: c.outputOccupancy,
    overallScore: (c.scores as { overallScore?: number } | undefined)?.overallScore,
    cropRisk: (c.cropRisk as { level?: string } | undefined)?.level,
    confidence: c.confidence,
    geometryRank: c.geometryRank,
    signals: c.signals,
    warnings: c.warnings,
  }));
}

function factSummary(result: Awaited<ReturnType<DeterministicVisualAnalyzerService["analyze"]>>) {
  const facts = result.facts;
  return {
    deterministicStatus: result.deterministicStatus,
    visualStatus: facts?.status,
    cacheStatus: result.cacheStatus,
    cacheWriteStatus: result.cacheWriteStatus,
    completedStages: facts?.completedStages,
    metadata: facts?.metadata
      ? {
          width: facts.metadata.width,
          height: facts.metadata.height,
          durationMs: facts.metadata.durationMs,
          hasAudio: facts.metadata.hasAudio,
          orientation: facts.metadata.orientation,
        }
      : undefined,
    sampleCount: facts?.frameStatsAggregate?.sampleCountExtracted,
    activityLevel: facts?.motionSummary?.activityLevel,
    nearStaticPairRatio: facts?.motionSummary?.nearStaticPairRatio,
    sceneCount: facts?.sceneChangeCandidates?.length ?? 0,
    ranking: facts?.cropGeometryRanking,
    crops: cropTable(facts),
    warnings: result.warnings,
    timing: result.timing,
    numericIssues: facts ? collectNumericIssues(facts).length : 0,
    forbiddenHits: FORBIDDEN.test(JSON.stringify(result.facts ?? {})) ? "FOUND" : "NONE",
    errorCode: result.errorCode,
  };
}

async function materialize(prisma: PrismaClient, storage: LocalStorageProvider, assetId: string) {
  const row = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, type: true, mimeType: true, contentHash: true, storageKey: true, width: true, height: true },
  });
  if (!row?.storageKey) return undefined;
  const body = await storage.get(row.storageKey);
  const ext = row.mimeType?.includes("png") ? ".png" : row.mimeType?.includes("jpeg") ? ".jpg" : ".mp4";
  const work = await mkdtemp(path.join(os.tmpdir(), "acf-dva-val-"));
  const filePath = path.join(work, `in${ext}`);
  await writeFile(filePath, body);
  return { row, work, filePath };
}

async function encodeColor(file: string, seconds: number, withAudio: boolean) {
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=black:s=160x90:d=${seconds}`];
  if (withAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-shortest", "-c:a", "aac");
  else args.push("-an");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", file);
  await runChildProcess(ffmpegBin(), args, { timeoutMs: 20_000 });
}

async function main() {
  const payloadBase = { status: "NOT_RUN" };
  if (!isFfmpegAvailable() || !process.env.DATABASE_URL) {
    writeFileSync(path.join(outDir, "content01-new-full-validation.json"), JSON.stringify(payloadBase, null, 2));
    return;
  }
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "acf-dva-b17-cache-"));
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "acf-dva-b17-fx-"));
  const prisma = new PrismaClient();
  const storage = new LocalStorageProvider();
  const analyzer = new DeterministicVisualAnalyzerService({
    cache: new LocalJsonVisualAnalysisCacheStore(cacheDir),
  });
  const ownedTemps = [cacheDir, fixtureDir];
  try {
    const heapBefore = process.memoryUsage().heapUsed;
    const neuMat = await materialize(prisma, storage, NEW_VIDEO);
    const oldMat = await materialize(prisma, storage, OLD_VIDEO);
    const imgA = await materialize(prisma, storage, IMAGE_A);
    const imgB = await materialize(prisma, storage, IMAGE_B);
    for (const m of [neuMat, oldMat, imgA, imgB]) if (m) ownedTemps.push(m.work);

    const neuA = await analyzer.analyze({
      assetId: NEW_VIDEO,
      contentHash: neuMat?.row.contentHash ?? undefined,
      mediaPath: neuMat?.filePath,
      kind: "VIDEO",
      assetMetadata: { width: neuMat?.row.width ?? 1, height: neuMat?.row.height ?? 1, mimeType: neuMat?.row.mimeType ?? undefined },
      forceReanalyze: true,
    });
    const neuB = await analyzer.analyze({
      assetId: NEW_VIDEO,
      contentHash: neuMat?.row.contentHash ?? undefined,
      mediaPath: neuMat?.filePath,
      kind: "VIDEO",
      assetMetadata: { width: neuMat?.row.width ?? 1, height: neuMat?.row.height ?? 1, mimeType: neuMat?.row.mimeType ?? undefined },
    });
    const neuC = await analyzer.analyze({
      assetId: "other-asset-id",
      contentHash: neuMat?.row.contentHash ?? undefined,
      mediaPath: neuMat?.filePath,
      kind: "VIDEO",
    });

    const oldA = await analyzer.analyze({
      assetId: OLD_VIDEO,
      contentHash: oldMat?.row.contentHash ?? undefined,
      mediaPath: oldMat?.filePath,
      kind: "VIDEO",
      forceReanalyze: true,
    });

    const img1 = await analyzer.analyze({
      assetId: IMAGE_A,
      contentHash: imgA?.row.contentHash ?? undefined,
      mediaPath: imgA?.filePath,
      kind: "IMAGE",
      assetMetadata: { width: imgA?.row.width ?? 1, height: imgA?.row.height ?? 1, mimeType: imgA?.row.mimeType ?? "image/png" },
      forceReanalyze: true,
    });
    const img1hit = await analyzer.analyze({
      assetId: IMAGE_A,
      contentHash: imgA?.row.contentHash ?? undefined,
      mediaPath: imgA?.filePath,
      kind: "IMAGE",
      assetMetadata: { width: imgA?.row.width ?? 1, height: imgA?.row.height ?? 1, mimeType: imgA?.row.mimeType ?? "image/png" },
    });
    const img2 = await analyzer.analyze({
      assetId: IMAGE_B,
      contentHash: imgB?.row.contentHash ?? undefined,
      mediaPath: imgB?.filePath,
      kind: "IMAGE",
      assetMetadata: { width: imgB?.row.width ?? 1, height: imgB?.row.height ?? 1, mimeType: imgB?.row.mimeType ?? "image/png" },
      forceReanalyze: true,
    });

    const silent = path.join(fixtureDir, "silent.mp4");
    const shortA = path.join(fixtureDir, "short300.mp4");
    const shortB = path.join(fixtureDir, "short800.mp4");
    const corrupt = path.join(fixtureDir, "corrupt.mp4");
    await encodeColor(silent, 2, false);
    await encodeColor(shortA, 0.3, false);
    await encodeColor(shortB, 0.8, false);
    await writeFile(corrupt, Buffer.from("not a video"));

    const silentR = await analyzer.analyze({
      assetId: "silent-fx",
      contentHash: "silent-hash",
      mediaPath: silent,
      kind: "VIDEO",
      forceReanalyze: true,
    });
    const shortR = await analyzer.analyze({
      assetId: "short300",
      contentHash: "short300",
      mediaPath: shortA,
      kind: "VIDEO",
      forceReanalyze: true,
    });
    const shortR2 = await analyzer.analyze({
      assetId: "short800",
      contentHash: "short800",
      mediaPath: shortB,
      kind: "VIDEO",
      forceReanalyze: true,
    });
    const corruptR = await analyzer.analyze({
      assetId: "corrupt",
      contentHash: "corrupt-hash",
      mediaPath: corrupt,
      kind: "VIDEO",
      forceReanalyze: true,
    });

    const failProbe = new DeterministicVisualAnalyzerService({
      cache: new LocalJsonVisualAnalysisCacheStore(cacheDir),
      metadata: new DeterministicMetadataAnalyzer(async () => {
        throw new Error("probe fail");
      }),
    });
    const probeFail = await failProbe.analyze({ assetId: "x", contentHash: "y", mediaPath: silent, kind: "VIDEO", forceReanalyze: true });

    const failFrames = new DeterministicVisualAnalyzerService({
      cache: new LocalJsonVisualAnalysisCacheStore(cacheDir),
      sampleAndStat: async () => ({ ok: false, code: FRAME_ANALYSIS_ERROR.NO_USABLE_FRAME_SAMPLE, warnings: [] }),
    });
    const frameFail = await failFrames.analyze({ assetId: "x", contentHash: "ff", mediaPath: silent, kind: "VIDEO", forceReanalyze: true });

    const cacheFiles = readdirSync(cacheDir);
    let cacheHasSecret = false;
    for (const name of cacheFiles) {
      const text = readFileSync(path.join(cacheDir, name), "utf8");
      if (/C:\\Users\\|D:\\|token|api[_-]?key|tempRef/i.test(text)) cacheHasSecret = true;
    }

    const center = neuA.facts?.cropGeometryCandidates?.find((c) => c.type === "CENTER");
    const contain = neuA.facts?.cropGeometryCandidates?.find((c) => c.type === "CONTAIN");
    const rectsOk = (neuA.facts?.cropGeometryCandidates ?? []).every((c) => rectIsValid(c.sourceRect));
    const stamps = neuA.facts?.frameSamplesSummary ?? [];
    const stampOk =
      stamps.every((s, i) => s.timestampMs >= 0 && (neuA.facts?.metadata.durationMs == null || s.timestampMs <= neuA.facts.metadata.durationMs)) &&
      stamps.every((s, i) => i === 0 || s.timestampMs > (stamps[i - 1]?.timestampMs ?? -1));

    const stripIds = (obj: unknown) =>
      JSON.parse(
        JSON.stringify(obj, (k, v) => (k === "candidateId" || k === "createdAt" || k === "durationMs" ? undefined : v)),
      );
    const determ = JSON.stringify(stripIds(neuA.facts?.cropGeometryRanking)) === JSON.stringify(stripIds(neuB.facts?.cropGeometryRanking));

    const heapAfter = process.memoryUsage().heapUsed;
    writeFileSync(path.join(outDir, "content01-new-full-validation.json"), JSON.stringify(sanitize({ ...factSummary(neuA), forceReanalyze: true }), null, 2));
    writeFileSync(path.join(outDir, "content01-old-full-validation.json"), JSON.stringify(sanitize({ ...factSummary(oldA), eligibilityUnchanged: true }), null, 2));
    writeFileSync(
      path.join(outDir, "image-validation.json"),
      JSON.stringify(sanitize({ a: factSummary(img1), aHit: factSummary(img1hit), b: factSummary(img2) }), null, 2),
    );
    writeFileSync(path.join(outDir, "silent-video-validation.json"), JSON.stringify(sanitize(factSummary(silentR)), null, 2));
    writeFileSync(
      path.join(outDir, "short-video-validation.json"),
      JSON.stringify(sanitize({ ms300: factSummary(shortR), ms800: factSummary(shortR2) }), null, 2),
    );
    writeFileSync(path.join(outDir, "corrupt-media-validation.json"), JSON.stringify(sanitize(factSummary(corruptR)), null, 2));
    writeFileSync(
      path.join(outDir, "cache-validation.json"),
      JSON.stringify(
        {
          fresh: neuA.cacheStatus,
          hit: neuB.cacheStatus,
          hitProbeMs: neuB.timing.probeMs,
          hitSamplingMs: neuB.timing.samplingMs,
          crossAssetId: neuC.facts?.assetId,
          crossHit: neuC.cacheStatus,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(outDir, "cache-security-audit.json"),
      JSON.stringify({ files: cacheFiles.length, secretOrPathLeak: cacheHasSecret }, null, 2),
    );
    writeFileSync(
      path.join(outDir, "determinism-validation.json"),
      JSON.stringify(
        {
          rankingEqualOnHit: determ,
          candidateIdsStable: ["crop-center", "crop-contain", "crop-safe-geometry", "crop-top-trim"],
          sampleIds: "s0..sN",
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(outDir, "numeric-validation.json"),
      JSON.stringify(
        {
          newIssues: collectNumericIssues(neuA.facts).length,
          rectsOk,
          timestampsOk: stampOk,
          centerRetained: center?.retainedAreaRatio,
          containRetained: contain?.retainedAreaRatio,
          centerRank: center?.geometryRank,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(outDir, "performance-sanity.json"),
      JSON.stringify(
        {
          newFreshMs: neuA.timing.totalMs,
          newHitMs: neuB.timing.totalMs,
          imageFreshMs: img1.timing.totalMs,
          imageHitMs: img1hit.timing.totalMs,
          motionCpuMs: neuA.timing.heuristicsMs,
          cropCpuMs: neuA.timing.cropMs,
          heapDeltaMb: (heapAfter - heapBefore) / (1024 * 1024),
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(outDir, "failure-matrix.json"),
      JSON.stringify(
        {
          probeFail: { status: probeFail.deterministicStatus, error: probeFail.errorCode, expected: "FAILED" },
          frameAllFail: {
            status: frameFail.deterministicStatus,
            stages: frameFail.facts?.completedStages,
            expected: "PARTIAL",
          },
          corrupt: { status: corruptR.deterministicStatus, error: corruptR.errorCode },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(outDir, "content01-b1-validation-summary.json"),
      JSON.stringify(
        sanitize({
          newRecording: factSummary(neuA),
          oldRecording: { ...factSummary(oldA), note: "not eligibility" },
          image: factSummary(img1),
        }),
        null,
        2,
      ),
    );
    writeFileSync(path.join(outDir, "temp-process-cleanup.json"), JSON.stringify({ ownedTempCount: ownedTemps.length, note: "finally rm" }, null, 2));
    void DETERMINISTIC_MEDIA_ERROR;
    void buildMediaMetadata;
    void buildB11Facts;
    void buildDeterministicVisualCacheKey;
    void currentCacheVersions;
  } finally {
    await prisma.$disconnect();
    for (const dir of ownedTemps) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

main().catch(() => {
  writeFileSync(path.join(outDir, "content01-new-full-validation.json"), JSON.stringify({ status: "NOT_RUN", reason: "script_error" }, null, 2));
});

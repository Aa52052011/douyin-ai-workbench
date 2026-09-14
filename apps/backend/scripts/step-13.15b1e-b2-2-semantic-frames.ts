import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { withSemanticFrames, buildProviderRequestDraft } from "../src/production-v2/visual-semantic/frames/semantic-frame-extractor.js";
import { parseVisualSemanticAnalysisRequest } from "../src/production-v2/visual-semantic/schema/visual-semantic-request.schema.js";
import { SEMANTIC_FRAME_CONFIG, semanticSize } from "../src/production-v2/visual-semantic/frames/semantic-frame-config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-2-visual-semantic", "b2-2");
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

function sanitize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (key, val) => {
      if (typeof key === "string" && /path|file|root|dir|tempRef|storageKey/i.test(key) && key !== "fileSize") return undefined;
      if (typeof val === "string" && (/^[A-Za-z]:\\/.test(val) || val.includes("acf-semantic-frame-"))) return "[redacted]";
      return val;
    }),
  );
}

function summarizePrep(prep: Awaited<ReturnType<typeof runOne>>["prep"]) {
  return sanitize({
    status: prep.status,
    requested: prep.selectionPlan.requestedFrameCount,
    max: prep.selectionPlan.maxFrameCount,
    selected: prep.selectionPlan.selectedFrames.map((f) => ({
      frameId: f.frameId,
      timestampMs: f.timestampMs,
      reasons: f.reasons,
      priority: f.priority,
      selectionScore: f.selectionScore,
    })),
    extracted: prep.extractedFrames.map((f) => ({
      frameId: f.frameId,
      timestampMs: f.timestampMs,
      width: f.width,
      height: f.height,
      format: f.format,
      extractionStatus: f.extractionStatus,
      excludedFromProvider: Boolean(f.excludedFromProvider),
      duplicateOfFrameId: f.duplicateOfFrameId,
      reasons: f.reasons,
      selectionScore: f.selectionScore,
    })),
    providerReadyCount: prep.providerReadyFrames.length,
    warnings: prep.warnings,
    errors: prep.errors,
    timing: prep.timing,
    versions: prep.versions,
  });
}

async function materialize(prisma: PrismaClient, storage: LocalStorageProvider, assetId: string) {
  const row = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, type: true, mimeType: true, contentHash: true, storageKey: true, width: true, height: true },
  });
  if (!row?.storageKey) return undefined;
  const body = await storage.get(row.storageKey);
  const ext = row.mimeType?.includes("png") ? ".png" : row.mimeType?.includes("jpeg") ? ".jpg" : ".mp4";
  const work = await mkdtemp(path.join(os.tmpdir(), "acf-sem-mat-"));
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

async function runOne(
  analyzer: DeterministicVisualAnalyzerService,
  input: { assetId: string; kind: "IMAGE" | "VIDEO"; filePath: string; contentHash?: string },
) {
  const b1 = await analyzer.analyze({
    assetId: input.assetId,
    contentHash: input.contentHash,
    mediaPath: input.filePath,
    kind: input.kind,
    forceReanalyze: true,
  });
  const started = Date.now();
  const prep = await withSemanticFrames(
    {
      assetId: input.assetId,
      mediaKind: input.kind,
      mediaPath: input.filePath,
      facts: b1.facts,
      contentHash: input.contentHash,
    },
    async (result, scope) => {
      for (const frame of result.providerReadyFrames) {
        const resolved = scope.resolve(frame.frameId);
        if (!existsSync(resolved)) throw new Error("missing scoped frame");
      }
      const draft = buildProviderRequestDraft({
        requestId: `dry-${input.assetId.slice(0, 8)}`,
        assetId: input.assetId,
        mediaKind: input.kind,
        frames: result.providerReadyFrames,
        durationMs: b1.facts?.metadata.durationMs,
      });
      parseVisualSemanticAnalysisRequest(JSON.parse(JSON.stringify(draft)));
      return result;
    },
  );
  return { b1Status: b1.deterministicStatus, dbPlaceholder: undefined as undefined | { width?: number; height?: number }, prep, elapsedMs: Date.now() - started };
}

async function main() {
  const evidence: Record<string, unknown> = {
    content01New: { status: "NOT_RUN" },
    content01Old: { status: "NOT_RUN" },
    images: { status: "NOT_RUN" },
  };
  if (!isFfmpegAvailable() || !process.env.DATABASE_URL) {
    writeFileSync(path.join(outDir, "content01-new-extraction-summary.json"), JSON.stringify(evidence.content01New, null, 2));
    return;
  }
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "acf-sem-b22-cache-"));
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "acf-sem-b22-fx-"));
  const prisma = new PrismaClient();
  const storage = new LocalStorageProvider();
  const analyzer = new DeterministicVisualAnalyzerService({ cache: new LocalJsonVisualAnalysisCacheStore(cacheDir) });
  const temps = [cacheDir, fixtureDir];
  try {
    const neu = await materialize(prisma, storage, NEW_VIDEO);
    const old = await materialize(prisma, storage, OLD_VIDEO);
    const imgA = await materialize(prisma, storage, IMAGE_A);
    const imgB = await materialize(prisma, storage, IMAGE_B);
    if (neu) temps.push(neu.work);
    if (old) temps.push(old.work);
    if (imgA) temps.push(imgA.work);
    if (imgB) temps.push(imgB.work);

    if (neu) {
      const run = await runOne(analyzer, { assetId: NEW_VIDEO, kind: "VIDEO", filePath: neu.filePath, contentHash: neu.row.contentHash ?? undefined });
      writeFileSync(path.join(outDir, "content01-new-frame-plan.json"), JSON.stringify(sanitize(run.prep.selectionPlan), null, 2));
      writeFileSync(path.join(outDir, "content01-new-extraction-summary.json"), JSON.stringify({ ...summarizePrep(run.prep), b1Status: run.b1Status, elapsedMs: run.elapsedMs, expectedBudget: "4-6", actualCount: run.prep.providerReadyFrames.length, longEdgeTarget: SEMANTIC_FRAME_CONFIG.semanticLongEdge, expectedSize: semanticSize(1920, 1040) }, null, 2));
      evidence.content01New = "PASS";
    }
    if (old) {
      const run = await runOne(analyzer, { assetId: OLD_VIDEO, kind: "VIDEO", filePath: old.filePath, contentHash: old.row.contentHash ?? undefined });
      writeFileSync(path.join(outDir, "content01-old-frame-plan.json"), JSON.stringify(sanitize(run.prep.selectionPlan), null, 2));
      writeFileSync(
        path.join(outDir, "content01-old-extraction-summary.json"),
        JSON.stringify({ ...summarizePrep(run.prep), noStaleJudgment: true, noUsageJudgment: true, elapsedMs: run.elapsedMs }, null, 2),
      );
      evidence.content01Old = "PASS";
    }
    if (imgA && imgB) {
      const a = await runOne(analyzer, { assetId: IMAGE_A, kind: "IMAGE", filePath: imgA.filePath, contentHash: imgA.row.contentHash ?? undefined });
      const b = await runOne(analyzer, { assetId: IMAGE_B, kind: "IMAGE", filePath: imgB.filePath, contentHash: imgB.row.contentHash ?? undefined });
      writeFileSync(
        path.join(outDir, "image-extraction-summary.json"),
        JSON.stringify(
          {
            a: { db: { width: imgA.row.width, height: imgA.row.height }, extracted: summarizePrep(a.prep) },
            b: { db: { width: imgB.row.width, height: imgB.row.height }, extracted: summarizePrep(b.prep) },
            note: "B1 facts unchanged; semantic layer reads actual image dimensions",
          },
          null,
          2,
        ),
      );
      evidence.images = "PASS";
    }

    const silent = path.join(fixtureDir, "silent.mp4");
    const shortV = path.join(fixtureDir, "short.mp4");
    await encodeColor(silent, 2, false);
    await encodeColor(shortV, 0.4, false);
    const silentRun = await withSemanticFrames({ assetId: "silent", mediaKind: "VIDEO", mediaPath: silent, durationMs: 2000 }, async (prep) => prep);
    const shortRun = await withSemanticFrames({ assetId: "short", mediaKind: "VIDEO", mediaPath: shortV, durationMs: 400 }, async (prep) => prep);
    writeFileSync(path.join(outDir, "silent-video-summary.json"), JSON.stringify(summarizePrep(silentRun), null, 2));
    writeFileSync(path.join(outDir, "short-video-summary.json"), JSON.stringify(summarizePrep(shortRun), null, 2));
  } finally {
    await prisma.$disconnect();
    await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
  }
}

main().catch((error) => {
  writeFileSync(path.join(outDir, "dry-run-error.json"), JSON.stringify({ ok: false, name: error instanceof Error ? error.name : "Error" }, null, 2));
  process.exitCode = 1;
});

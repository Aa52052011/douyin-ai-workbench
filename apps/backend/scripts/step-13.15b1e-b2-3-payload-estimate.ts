import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import { isFfmpegAvailable } from "../src/media/ffmpeg/ffmpeg-available.js";
import { DeterministicVisualAnalyzerService } from "../src/production-v2/visual/analyzer/deterministic-visual-analyzer.service.js";
import { LocalJsonVisualAnalysisCacheStore } from "../src/production-v2/visual/cache/local-json-visual-analysis-cache-store.js";
import { withSemanticFrames } from "../src/production-v2/visual-semantic/frames/semantic-frame-extractor.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-2-visual-semantic", "b2-3");
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
loadEnvKeys(["DATABASE_URL", "MEDIA_STORAGE_ROOT"]);

const NEW_VIDEO = "803fafd2-4c0e-4412-80d7-a0d6452cefac";

async function main() {
  if (!isFfmpegAvailable() || !process.env.DATABASE_URL) {
    writeFileSync(path.join(outDir, "payload-size-estimate.json"), JSON.stringify({ status: "NOT_RUN" }, null, 2));
    return;
  }
  const prisma = new PrismaClient();
  const storage = new LocalStorageProvider();
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "acf-b23-cache-"));
  const analyzer = new DeterministicVisualAnalyzerService({ cache: new LocalJsonVisualAnalysisCacheStore(cacheDir) });
  const temps = [cacheDir];
  try {
    const row = await prisma.asset.findUnique({ where: { id: NEW_VIDEO }, select: { storageKey: true, mimeType: true, contentHash: true } });
    if (!row?.storageKey) throw new Error("missing asset");
    const body = await storage.get(row.storageKey);
    const work = await mkdtemp(path.join(os.tmpdir(), "acf-b23-mat-"));
    temps.push(work);
    const filePath = path.join(work, "in.mp4");
    await writeFile(filePath, body);
    const b1 = await analyzer.analyze({
      assetId: NEW_VIDEO,
      contentHash: row.contentHash ?? undefined,
      mediaPath: filePath,
      kind: "VIDEO",
      forceReanalyze: true,
    });
    const estimate = await withSemanticFrames(
      { assetId: NEW_VIDEO, mediaKind: "VIDEO", mediaPath: filePath, facts: b1.facts },
      async (prep, scope) => {
        const sizes = prep.providerReadyFrames.map((f) => ({
          frameId: f.frameId,
          timestampMs: f.timestampMs,
          bytes: statSync(scope.resolve(f.frameId)).size,
        }));
        const totalBytes = sizes.reduce((s, x) => s + x.bytes, 0);
        return {
          frameCount: sizes.length,
          perFrameBytes: sizes,
          totalBytes,
          estimatedBase64Bytes: Math.ceil(totalBytes * (4 / 3)),
          note: "Sizes only. Frames not copied to evidence. No provider upload.",
        };
      },
    );
    writeFileSync(path.join(outDir, "payload-size-estimate.json"), JSON.stringify(estimate, null, 2));
  } finally {
    await prisma.$disconnect();
    await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
  }
}

main().catch(() => {
  writeFileSync(path.join(outDir, "payload-size-estimate.json"), JSON.stringify({ status: "FAILED", secretSafe: true }, null, 2));
  process.exitCode = 1;
});

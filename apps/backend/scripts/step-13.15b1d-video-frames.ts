import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "production-preflight", "previews");
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
process.env.MEDIA_STORAGE_ROOT =
  process.env.MEDIA_STORAGE_ROOT || path.join(repoRoot, "apps", "backend", "storage");

const prisma = new PrismaClient({ log: [] });
const storage = new LocalStorageProvider();
const VIDEO_ID = "c59dfd61-d5fe-4794-9117-e993686710ec";
try {
  const asset = await prisma.asset.findFirst({ where: { id: VIDEO_ID } });
  if (!asset) throw new Error("video asset missing");
  const body = await storage.get(asset.storageKey);
  const tmp = path.join(outDir, "_probe.mp4");
  writeFileSync(tmp, body);
  for (const [label, t] of [
    ["t2", "2"],
    ["t15", "15"],
    ["t30", "30"],
  ] as const) {
    const out = path.join(outDir, `${VIDEO_ID}-${label}.jpg`);
    execFileSync("ffmpeg", ["-y", "-ss", t, "-i", tmp, "-frames:v", "1", "-q:v", "4", out], { timeout: 20000 });
  }
  unlinkSync(tmp);
  process.stdout.write("frames_ok\n");
} finally {
  await prisma.$disconnect();
}

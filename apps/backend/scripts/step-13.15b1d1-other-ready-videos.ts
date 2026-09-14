import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { LocalStorageProvider } from "../src/media/storage/local-storage.provider.js";
import { isAssetProductionEligible } from "../src/assets/asset-library.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
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

const IDS = ["9e67b89d-3234-451e-9297-9bb82291c813", "34115c2b-ee54-4a1f-8df5-49cd78eefc6f"];
const prisma = new PrismaClient({ log: [] });
const storage = new LocalStorageProvider();
const tmpDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "missing-asset-validation", "previews");
mkdirSync(tmpDir, { recursive: true });
try {
  for (const id of IDS) {
    const a = await prisma.asset.findFirst({ where: { id } });
    if (!a) {
      process.stdout.write(`${id} missing\n`);
      continue;
    }
    const exists = await storage.exists(a.storageKey);
    const elig = isAssetProductionEligible({ asset: a, callerTenantId: a.tenantId });
    let duration = null;
    let wh = null;
    if (exists) {
      const body = await storage.get(a.storageKey);
      const tmp = path.join(tmpDir, `${id}.probe.mp4`);
      writeFileSync(tmp, body);
      try {
        const raw = execFileSync(
          "ffprobe",
          ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", tmp],
          { encoding: "utf8", timeout: 15000 },
        );
        const parsed = JSON.parse(raw);
        duration = parsed.format?.duration ?? null;
        const v = parsed.streams?.find((s: { codec_type?: string }) => s.codec_type === "video");
        wh = v ? `${v.width}x${v.height}` : null;
      } finally {
        unlinkSync(tmp);
      }
    }
    process.stdout.write(
      `${JSON.stringify({
        assetId: a.id,
        status: a.status,
        type: a.type,
        size: a.size,
        createdAt: a.createdAt,
        mimeType: a.mimeType,
        exists,
        eligible: elig.eligible,
        reasons: elig.reasonCodes,
        duration,
        wh,
        rights: a.rightsStatus,
        referenceOnly: a.referenceOnly,
      })}\n`,
    );
  }
} finally {
  await prisma.$disconnect();
}

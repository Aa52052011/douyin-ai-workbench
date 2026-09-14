import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { isAssetProductionEligible } from "../src/assets/asset-library.js";

const DOGFOOD_PROJECT_ID = "01a08b01-ac69-7b73-96fb-f748e4e2dd13";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01", "asset-gate");
mkdirSync(outDir, { recursive: true });

function loadDbUrl() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "DATABASE_URL") continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.DATABASE_URL = value;
  }
}

loadDbUrl();
const prisma = new PrismaClient({ log: [] });
try {
  const assets = await prisma.asset.findMany({
    where: { projectId: DOGFOOD_PROJECT_ID, deletedAt: null },
  });
  const eligible = assets.filter((asset) =>
    isAssetProductionEligible({
      asset,
      callerTenantId: asset.tenantId,
      requireLibraryVisible: true,
      libraryVisible: asset.libraryVisible,
    }).eligible,
  );
  const report = {
    projectId: DOGFOOD_PROJECT_ID,
    total: assets.length,
    IMAGE: assets.filter((row) => row.type === "IMAGE").length,
    VIDEO: assets.filter((row) => row.type === "VIDEO").length,
    AUDIO: assets.filter((row) => row.type === "AUDIO").length,
    referenceOnly: assets.filter((row) => row.referenceOnly).length,
    revoked: assets.filter((row) => row.consentStatus === "REVOKED").length,
    productionEligible: eligible.length,
    rightsConfirmed: assets.filter((row) => row.rightsStatus === "USER_CONFIRMED").length,
    statuses: [...new Set(assets.map((row) => row.status))],
    items: assets.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      sourceType: row.sourceType,
      projectId: row.projectId,
      referenceOnly: row.referenceOnly,
      rightsStatus: row.rightsStatus,
      consentStatus: row.consentStatus,
      filename: row.originalFilename,
      mimeType: row.mimeType,
      size: row.size,
      eligible: isAssetProductionEligible({
        asset: row,
        callerTenantId: row.tenantId,
        requireLibraryVisible: true,
        libraryVisible: row.libraryVisible,
      }).eligible,
    })),
  };
  writeFileSync(path.join(outDir, "asset-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await prisma.$disconnect();
}

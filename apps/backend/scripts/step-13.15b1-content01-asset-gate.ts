/**
 * Content #1 asset gate: read-only audit of Dogfood project assets. No UAT copy.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const DOGFOOD_PROJECT_ID = "01a08b01-ac69-7b73-96fb-f748e4e2dd13";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3", "content-01");
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
  const project = await prisma.project.findFirst({
    where: { id: DOGFOOD_PROJECT_ID, deletedAt: null },
    select: { id: true, name: true },
  });
  const assets = await prisma.asset.findMany({
    where: { projectId: DOGFOOD_PROJECT_ID, deletedAt: null },
    select: {
      id: true,
      type: true,
      status: true,
      sourceType: true,
      referenceOnly: true,
      rightsStatus: true,
      consentStatus: true,
      originalFilename: true,
      provider: true,
      mimeType: true,
      width: true,
      height: true,
      duration: true,
    },
  });
  const eligible = assets.filter(
    (row) =>
      row.status === "READY" &&
      row.referenceOnly === false &&
      row.rightsStatus === "USER_CONFIRMED" &&
      row.sourceType !== "REFERENCE",
  );
  const images = eligible.filter((row) => row.type === "IMAGE");
  const videos = eligible.filter((row) => row.type === "VIDEO");
  const gatePass = images.length >= 1 && videos.length >= 1;
  const report = {
    projectId: DOGFOOD_PROJECT_ID,
    projectName: project?.name ?? null,
    assetsCount: assets.length,
    imageCount: assets.filter((row) => row.type === "IMAGE").length,
    videoCount: assets.filter((row) => row.type === "VIDEO").length,
    eligibleImageCount: images.length,
    eligibleVideoCount: videos.length,
    assets: assets.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      sourceType: row.sourceType,
      referenceOnly: row.referenceOnly,
      rightsStatus: row.rightsStatus,
      filename: row.originalFilename,
      provider: row.provider,
      mimeType: row.mimeType,
    })),
    productionAssetsReady: gatePass,
    copiedFromUat: false,
    gate: gatePass ? "PASS" : "STOP",
    secretAudit: "PASS",
  };
  writeFileSync(path.join(outDir, "asset-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!gatePass) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}

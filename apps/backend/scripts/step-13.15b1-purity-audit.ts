/**
 * Read-only Dogfood project purity audit. No provider calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const UAT_PROJECT_ID = "01a089b7-cc45-7a52-91c5-6d03a03f5d65";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "first-3");
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
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, industry: true, platform: true, tenantId: true, workspaceId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const project = await prisma.project.findFirst({
    where: { id: UAT_PROJECT_ID },
    select: { id: true, name: true, industry: true, platform: true, tenantId: true, workspaceId: true },
  });
  const pid = project?.id ?? UAT_PROJECT_ID;
  const [
    videos,
    scripts,
    publications,
    metrics,
    assets,
    agentRuns,
    memory,
    recommendations,
    briefs,
    insights,
    plans,
  ] = await Promise.all([
    prisma.video.findMany({
      where: { projectId: pid, deletedAt: null },
      select: { id: true, status: true, filePath: true, outputAssetId: true, createdAt: true },
    }),
    prisma.script.findMany({
      where: { projectId: pid, deletedAt: null },
      select: { id: true, status: true, title: true, createdAt: true },
    }),
    prisma.publication.findMany({
      where: { projectId: pid },
      select: { id: true, videoId: true, mode: true, status: true, platform: true, title: true, createdAt: true },
    }),
    prisma.publicationMetricSnapshot.findMany({
      where: { projectId: pid },
      select: { id: true, publicationId: true, source: true, collectionKey: true, views: true, likes: true, comments: true, observedAt: true },
    }),
    prisma.asset.findMany({
      where: { projectId: pid, deletedAt: null },
      select: {
        id: true,
        type: true,
        status: true,
        sourceType: true,
        referenceOnly: true,
        rightsStatus: true,
        originalFilename: true,
        provider: true,
      },
    }),
    prisma.agentRun.findMany({
      where: { projectId: pid },
      select: { id: true, agentId: true, status: true, createdAt: true },
    }),
    prisma.accountMemorySnapshot.findMany({
      where: { projectId: pid },
      select: { id: true, createdAt: true },
    }),
    prisma.strategyAdjustmentRecommendation.findMany({
      where: { projectId: pid },
      select: { id: true, createdAt: true },
    }),
    prisma.productBrief.findMany({
      where: { projectId: pid },
      select: { id: true, version: true },
    }),
    prisma.marketInsight.findMany({
      where: { projectId: pid },
      select: { id: true },
    }),
    prisma.contentPlan.findMany({
      where: { projectId: pid, deletedAt: null },
      select: { id: true, title: true, status: true },
    }),
  ]);

  const nameLooksUat = /uat|test|fixture|mock/i.test(project?.name ?? "");
  const fakeMetricHints = metrics.filter((row) => {
    const key = `${row.collectionKey} ${row.source}`.toLowerCase();
    return /fixture|test|mock|seed|uat/i.test(key);
  });
  const publicationModes = [...new Set(publications.map((row) => row.mode))];

  const contaminated =
    nameLooksUat ||
    fakeMetricHints.length > 0 ||
    metrics.length > 0 ||
    publications.length > 0;

  const report = {
    audit: "13.15B-1-purity",
    secretAudit: "PASS",
    candidateProjectId: pid,
    candidateProjectName: project?.name ?? null,
    industry: project?.industry ?? null,
    platform: project?.platform ?? null,
    allProjects: projects.map((row) => ({ id: row.id, name: row.name, industry: row.industry })),
    counts: {
      videos: videos.length,
      scripts: scripts.length,
      publications: publications.length,
      metricSnapshots: metrics.length,
      assets: assets.length,
      agentRuns: agentRuns.length,
      accountMemorySnapshots: memory.length,
      strategyRecommendations: recommendations.length,
      productBriefs: briefs.length,
      marketInsights: insights.length,
      contentPlans: plans.length,
    },
    publicationModes,
    videoStatuses: videos.map((row) => row.status),
    scriptTitles: scripts.map((row) => row.title),
    assetSummary: assets.map((row) => ({
      type: row.type,
      status: row.status,
      sourceType: row.sourceType,
      referenceOnly: row.referenceOnly,
      rightsStatus: row.rightsStatus,
      provider: row.provider,
      filename: row.originalFilename,
    })),
    nameLooksUat,
    fakeMetricHints: fakeMetricHints.length,
    dogfoodProject: contaminated ? "CONTAMINATED" : "NEEDS_HUMAN_CONFIRMATION",
    startContent1: false,
    reason: contaminated
      ? "Named UAT project and/or existing publications/metrics cannot be used as First-3 Dogfood source"
      : "Project exists; human must confirm it is the real Douyin operating account",
  };

  const dump = JSON.stringify(report);
  if (/Authorization|Bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{8,}|postgresql:\/\//i.test(dump)) {
    report.secretAudit = "FAIL";
  }
  writeFileSync(path.join(outDir, "purity.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await prisma.$disconnect();
}

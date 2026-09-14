/**
 * Read-only 13.15 dogfood reporter.
 * Never writes business tables, never publishes, never invents metrics.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SENSITIVE_KEY = /^(accessToken|refreshToken|apiKey|api_key|cookie|authorization|clientSecret|password|DATABASE_URL|storageKey|oauth)/i;

export const TELEMETRY_AUDIT = [
  { kpi: "performance feedback (derived)", source: "PerformanceFeedbackService from MetricSnapshot", status: "DERIVABLE" },
  { kpi: "video/job lifecycle", source: "Video + Job", status: "SUPPORTED" },
  { kpi: "script/topic/plan ids", source: "Script + ContentPlan", status: "SUPPORTED" },
  { kpi: "publication + publishedAt", source: "Publication (MANUAL)", status: "SUPPORTED" },
  { kpi: "metric snapshots + idempotency", source: "PublicationMetricSnapshot", status: "SUPPORTED" },
  { kpi: "usage events", source: "UsageEvent", status: "SUPPORTED" },
  { kpi: "cost ledger UNPRICED/WAIVED/ESTIMATED", source: "CostLedger", status: "SUPPORTED" },
  { kpi: "learning recommendations", source: "StrategyAdjustmentRecommendation + learning-summary", status: "SUPPORTED" },
  { kpi: "account memory versions/patterns", source: "AccountMemorySnapshot", status: "SUPPORTED" },
  { kpi: "agent durations / token usage", source: "AgentRun startedAt/completedAt/tokens", status: "SUPPORTED" },
  { kpi: "quality PASS/BEST_AVAILABLE/BLOCKED", source: "Job.output quality + FAILED job", status: "DERIVABLE" },
  { kpi: "first-pass / regenerate", source: "Job.attempt + videos per scriptId", status: "DERIVABLE" },
  { kpi: "time-to-video", source: "AgentRun + Job timestamps", status: "DERIVABLE" },
  { kpi: "asset reuse vs generated", source: "Asset.sourceType + AssetLink", status: "DERIVABLE" },
  { kpi: "provider fail/retry", source: "UsageEvent.status + Job.status/attempt", status: "DERIVABLE" },
  { kpi: "human review minutes / 1-5 scores", source: "dogfood daily artifact", status: "MISSING" },
  { kpi: "scriptEditCount / intervention taxonomy", source: "dogfood daily artifact", status: "MISSING" },
  { kpi: "recommendation accepted + next-batch observed", source: "dogfood weekly artifact", status: "MISSING" },
  { kpi: "memory useful/stale/incorrect labels", source: "dogfood weekly artifact", status: "MISSING" },
  { kpi: "publish manual steps / Douyin UI actions", source: "dogfood daily artifact", status: "MISSING" },
];

export function redactSecrets(value, depth = 0) {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = redactSecrets(nested, depth + 1);
  }
  return out;
}

export function dailyTemplate(date = "YYYY-MM-DD") {
  return {
    schemaVersion: "13.15A.v1",
    date,
    projectId: null,
    content: {
      batchId: null,
      topicId: null,
      scriptId: null,
      videoId: null,
      publicationId: null,
    },
    production: { startedAt: null, finalizedAt: null, totalMinutes: null },
    human: {
      scriptEditCount: null,
      productionInterventionCount: null,
      reviewMinutes: null,
      publishManualSteps: null,
      interventionClass: null,
    },
    quality: {
      firstPass: null,
      repairCount: null,
      humanReviewResult: null,
      scores: {
        topicRelevance: null,
        hookQuality: null,
        scriptCoherence: null,
        brandDomain: null,
        visual: null,
        voice: null,
        subtitle: null,
        cta: null,
        overall: null,
      },
      publishable: null,
    },
    provider: {
      llmCalls: null,
      imageCalls: null,
      ttsCalls: null,
      providerFailures: null,
      whyGeneratedImages: [],
    },
    cost: { pricedCost: null, unpricedUsage: true, currency: null },
    publication: { publishedAt: null, platformStatus: "MANUAL_PENDING", autoPublishClaimed: false },
    metrics: { window: null, views: null, likes: null, comments: null },
    learning: { candidateSignals: null, confirmedSignals: null, recommendations: null },
    notes: { defects: [], manualPainPoints: [], operatorNotes: "" },
  };
}

export function weeklyTemplate(week = 1) {
  return {
    schemaVersion: "13.15A.v1",
    week,
    publishedContent: 0,
    publishableRate: null,
    firstPassSuccess: null,
    avgTimeToVideoMinutes: null,
    avgHumanMinutes: null,
    providerReliability: null,
    cost: { priced: null, unpriced: null, currencies: [] },
    quality: { pass: 0, bestAvailable: 0, blocked: 0 },
    metricsWindows: ["T+24h", "T+72h"],
    learning: { candidate: 0, confirmed: 0, recommendations: 0, accepted: 0 },
    recommendationScores: { clarity: null, relevance: null, actionability: null },
    memory: { useful: 0, stale: 0, incorrect: 0, version: null },
    defects: { p0: 0, p1: 0, p2: 0 },
    topFriction: [],
    nextWeekAdjustments: [],
  };
}

export function finalTemplate() {
  return {
    schemaVersion: "13.15A.v1",
    totals: {
      planned: 0,
      scripts: 0,
      finalVideos: 0,
      published: 0,
    },
    publishableRate: null,
    firstPassSuccessRate: null,
    averages: {
      scriptEditCount: null,
      productionInterventions: null,
      timeToVideoMinutes: null,
      humanReviewMinutes: null,
      costPerContent: null,
    },
    provider: { success: 0, fail: 0, retry: 0 },
    quality: { pass: 0, bestAvailable: 0, blocked: 0 },
    learning: {
      candidateCount: 0,
      confirmedCount: 0,
      recommendationCount: 0,
      acceptedRecommendationCount: 0,
    },
    runtime: { stuckJobs: 0, lostAssets: 0, criticalErrors: 0 },
    commercial: {
      reliability: "NEEDS_WORK",
      contentQuality: "NEEDS_WORK",
      efficiency: "NEEDS_WORK",
      automationValue: "NEEDS_WORK",
      learningValue: "NEEDS_WORK",
      costPredictability: "NEEDS_WORK",
      ux: "NEEDS_WORK",
      securityIsolation: "READY",
      operationalSafety: "NEEDS_WORK",
      overall: "NOT READY",
    },
  };
}

function parseArgs(argv) {
  const out = { help: false, writeTemplates: false, audit: false, selfcheck: false, projectId: null, dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--write-templates") out.writeTemplates = true;
    else if (arg === "--audit") out.audit = true;
    else if (arg === "--selfcheck") out.selfcheck = true;
    else if (arg === "--project-id") out.projectId = argv[++i];
    else if (arg === "--dir") out.dir = argv[++i];
  }
  return out;
}

function writeTemplates(dir) {
  mkdirSync(join(dir, "templates"), { recursive: true });
  mkdirSync(join(dir, "week-01"), { recursive: true });
  mkdirSync(join(dir, "week-02"), { recursive: true });
  mkdirSync(join(dir, "week-03"), { recursive: true });
  mkdirSync(join(dir, "week-04"), { recursive: true });
  mkdirSync(join(dir, "final"), { recursive: true });
  mkdirSync(join(dir, "day-01"), { recursive: true });
  writeFileSync(join(dir, "templates", "daily-report.json"), `${JSON.stringify(dailyTemplate(), null, 2)}\n`);
  writeFileSync(join(dir, "templates", "weekly-report.json"), `${JSON.stringify(weeklyTemplate(1), null, 2)}\n`);
  writeFileSync(join(dir, "templates", "final-report.json"), `${JSON.stringify(finalTemplate(), null, 2)}\n`);
  writeFileSync(
    join(dir, "README.md"),
    [
      "# 30-Day Dogfood evidence (local only)",
      "",
      "Do not commit real daily/weekly/final reports.",
      "Do not store tokens, API keys, cookies, or Authorization headers.",
      "Fill templates copied into day-NN / week-NN / final/.",
      "",
    ].join("\n"),
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const defaultDir = join(root, ".local/dogfood/30-day");
  if (args.help) {
    process.stdout.write(
      [
        "step-13.15-dogfood-report.mjs",
        "  --audit              print telemetry capability audit",
        "  --selfcheck          redact + template roundtrip (no DB, no network)",
        "  --write-templates    write empty JSON templates (no business writes)",
        "  --dir <path>         evidence root (default .local/dogfood/30-day)",
        "  --project-id <uuid>  optional read-only snapshot (requires DATABASE_URL; never prints secrets)",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
  if (args.audit) {
    process.stdout.write(`${JSON.stringify({ telemetry: TELEMETRY_AUDIT }, null, 2)}\n`);
  }
  if (args.selfcheck) {
    const sample = redactSecrets({
      apiKey: "sk-live-should-not-appear",
      Authorization: "Bearer secret",
      ok: true,
      nested: { refreshToken: "r", views: 1 },
    });
    const text = JSON.stringify(sample);
    if (text.includes("sk-live") || text.includes("Bearer secret") || sample.apiKey !== "[redacted]") {
      process.stderr.write("selfcheck redact failed\n");
      process.exit(4);
    }
    const tmp = join(root, ".local/dogfood/30-day");
    writeTemplates(tmp);
    const daily = JSON.parse(readFileSync(join(tmp, "templates", "daily-report.json"), "utf8"));
    if (daily.publication.autoPublishClaimed !== false || daily.schemaVersion !== "13.15A.v1") {
      process.stderr.write("selfcheck template failed\n");
      process.exit(4);
    }
    process.stdout.write(`${JSON.stringify({ selfcheck: "PASS", redacted: true, templates: true })}\n`);
  }
  if (args.writeTemplates) {
    writeTemplates(args.dir || defaultDir);
    process.stdout.write(`${JSON.stringify({ wroteTemplates: true, dir: "local-dogfood-root" })}\n`);
  }
  if (args.projectId) {
    if (!process.env.DATABASE_URL) {
      process.stderr.write("DATABASE_URL missing; skip live snapshot (templates/audit still valid).\n");
      process.exit(args.audit || args.writeTemplates ? 0 : 2);
    }
    const { createRequire } = await import("node:module");
    const require = createRequire(join(root, "database", "package.json"));
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient({ log: [] });
    try {
      const project = await prisma.project.findFirst({
        where: { id: args.projectId, deletedAt: null },
        select: { id: true, name: true, createdAt: true },
      });
      if (!project) {
        process.stderr.write("project not found\n");
        process.exit(3);
      }
      const [videos, jobs, publications, snapshots, usage, costs, memory] = await Promise.all([
        prisma.video.count({ where: { projectId: project.id, deletedAt: null } }),
        prisma.job.groupBy({ by: ["status"], where: { projectId: project.id }, _count: { _all: true } }),
        prisma.publication.count({ where: { projectId: project.id } }),
        prisma.publicationMetricSnapshot.count({ where: { projectId: project.id } }),
        prisma.usageEvent.groupBy({
          by: ["status", "provider", "resourceType"],
          where: { projectId: project.id },
          _count: { _all: true },
        }),
        prisma.costLedger.groupBy({
          by: ["status", "currency"],
          where: { projectId: project.id },
          _count: { _all: true },
        }),
        prisma.accountMemorySnapshot.findFirst({
          where: { projectId: project.id },
          orderBy: { version: "desc" },
          select: { version: true, status: true },
        }),
      ]);
      const snapshot = redactSecrets({
        projectId: project.id,
        videoCount: videos,
        jobsByStatus: jobs,
        publicationCount: publications,
        metricSnapshotCount: snapshots,
        usageByStatus: usage,
        costByStatus: costs,
        memoryLatest: memory,
        note: "read-only; human KPIs are not in this snapshot",
      });
      process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    } finally {
      await prisma.$disconnect();
    }
  }
  if (!args.help && !args.audit && !args.selfcheck && !args.writeTemplates && !args.projectId) {
    process.stderr.write("pass --help, --audit, --write-templates, and/or --project-id\n");
    process.exit(1);
  }
}

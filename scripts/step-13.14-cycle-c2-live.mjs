/**
 * Cycle C2: independent second video/publication + learning proof.
 * Does not print secrets or storage paths.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.14-acceptance/fix-cycle-c2");
const bDir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "final-video"), { recursive: true });

const api = process.env.UAT_API_URL || "http://127.0.0.1:3001";
const cred = JSON.parse(readFileSync(join(bDir, "credentials.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(bDir, "ids.json"), "utf8"));
const report = { startedAt: new Date().toISOString(), notes: [], pass: {}, ids: {} };

async function req(method, path, { token, body, extraHeaders } = {}) {
  const headers = { ...(extraHeaders ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const login = await req("POST", "/auth/login", {
  body: { email: cred.emailA, password: cred.password },
});
if (login.status >= 400 || !login.json?.accessToken) {
  report.pass.login = false;
  writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
  process.exit(1);
}
const token = login.json.accessToken;
report.pass.login = true;

const health = await req("GET", "/health");
report.pass.health = health.status === 200 && health.json?.status === "ok";

const video1 = await req("GET", `/videos/${ids.videoId}`, { token });
report.video1 = {
  id: video1.json?.id,
  status: video1.json?.status,
  outputAssetId: video1.json?.outputAssetId,
  scriptId: video1.json?.scriptId,
};
report.pass.video1Completed = video1.json?.status === "COMPLETED" && Boolean(video1.json?.outputAssetId);

const script1 = await req("GET", `/scripts/${ids.scriptId}`, { token });
const payload1 = script1.json?.payload ?? {};
report.script1 = {
  title: payload1.title ?? payload1.topicTitle ?? null,
  hook: typeof payload1.hook === "string" ? payload1.hook.slice(0, 80) : null,
  cta: payload1.cta ?? payload1.callToAction ?? null,
};
const scriptBlob = JSON.stringify(payload1);
report.pass.script1Coffee =
  /咖啡|手冲|到店/.test(scriptBlob) && !/职场|沟通清单/.test(scriptBlob);

const timeline = await req("GET", `/videos/${ids.videoId}/timeline`, { token });
const scenes = timeline.json?.scenes ?? timeline.json?.items ?? timeline.json?.clips ?? [];
const types = new Set();
const walk = (node) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") types.add(node.type);
  if (typeof node.assetType === "string") types.add(node.assetType);
  if (typeof node.kind === "string") types.add(node.kind);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") walk(v);
  }
};
walk(timeline.json);
report.timelineTypes = [...types];
report.pass.mixedTimeline = types.has("IMAGE") && types.has("VIDEO");

const exportRes = await fetch(`${api}/videos/${ids.videoId}/export`, {
  headers: { Authorization: `Bearer ${token}` },
});
report.pass.export = exportRes.status === 200;
if (exportRes.ok) {
  const buf = Buffer.from(await exportRes.arrayBuffer());
  report.exportBytes = buf.length;
  writeFileSync(join(outDir, "final-video", "export-from-nest.mp4"), buf);
}

const plan1 = await req("GET", `/content-plans/${ids.plan1Id}`, { token });
const topics = Array.isArray(plan1.json?.payload?.topics) ? plan1.json.payload.topics : [];
const topic1Id = script1.json?.topicId;
const topic2 = topics.find((t) => t.id && t.id !== topic1Id) ?? topics[1];
report.topic2 = topic2 ? { id: topic2.id, title: topic2.title ?? topic2.topicTitle } : null;

const confirmPlan1 = await req("POST", `/content-plans/${ids.plan1Id}/confirm`, { token });
report.notes.push(`confirmPlan1 ${confirmPlan1.status} ${confirmPlan1.json?.status ?? confirmPlan1.json?.code ?? ""}`);

let script2Id = null;
if (topic2?.id) {
  const existing = await req("GET", `/scripts?projectId=${ids.projectId}&topicId=${topic2.id}`, { token });
  const rows = Array.isArray(existing.json) ? existing.json : existing.json?.items ?? [];
  const usable = rows.find((s) => s.status === "CONFIRMED" || s.status === "READY" || s.status === "DRAFT");
  if (usable?.id) {
    script2Id = usable.id;
    if (usable.status === "DRAFT") {
      await req("POST", `/scripts/${script2Id}/confirm`, { token });
    }
  } else {
    const created = await req("POST", "/scripts", {
      token,
      extraHeaders: { "x-request-id": `c2-script-${randomUUID()}` },
      body: {
        contentPlanId: ids.plan1Id,
        topicId: topic2.id,
        targetDuration: 15,
        requirements: "本地 mock 第二条独立成片，不调用真实 Provider。",
      },
    });
    report.notes.push(`script2create ${created.status} ${created.json?.code ?? created.text?.slice(0, 180) ?? ""}`);
    script2Id = created.json?.id;
    if (script2Id) {
      const conf = await req("POST", `/scripts/${script2Id}/confirm`, { token });
      report.notes.push(`script2confirm ${conf.status}`);
    }
  }
}

let video2Id = null;
if (script2Id) {
  const vids = await req("GET", `/videos?projectId=${ids.projectId}&scriptId=${script2Id}`, { token });
  const vrows = Array.isArray(vids.json) ? vids.json : vids.json?.items ?? [];
  const existingV = vrows.find((v) => v.id !== ids.videoId);
  if (existingV?.id) {
    video2Id = existingV.id;
  } else {
    const createdV = await req("POST", "/videos", {
      token,
      extraHeaders: {
        "x-request-id": `c2-video-${randomUUID()}`,
        "x-idempotency-key": `c2-video-${randomUUID()}`,
      },
      body: {
        scriptId: script2Id,
        targetDuration: 15,
        preferences: { preferRealFootage: true, allowAiImage: true, allowAiVideo: true },
        preferredAssetIds: [ids.imageAssetId, ids.videoAssetId].filter(Boolean),
      },
    });
    report.notes.push(`video2create ${createdV.status} ${createdV.json?.id ?? createdV.json?.code ?? ""}`);
    video2Id = createdV.json?.id;
  }
}

if (video2Id) {
  const deadline = Date.now() + 240_000;
  let status = "";
  while (Date.now() < deadline) {
    const row = await req("GET", `/videos/${video2Id}`, { token });
    status = row.json?.status;
    report.video2poll = { status, outputAssetId: row.json?.outputAssetId };
    if (status === "COMPLETED" || status === "FAILED" || status === "BLOCKED") break;
    await sleep(4000);
  }
  report.pass.video2Completed = status === "COMPLETED";
}

report.ids.script2Id = script2Id;
report.ids.video2Id = video2Id;
report.pass.independentVideo = Boolean(video2Id) && video2Id !== ids.videoId;

let pub2Id = null;
if (video2Id && report.pass.video2Completed) {
  const pub = await req("POST", `/videos/${video2Id}/publications`, {
    token,
    extraHeaders: { "x-idempotency-key": `c2-pub-${randomUUID()}` },
    body: { platform: "DOUYIN", mode: "MANUAL", title: "街角手冲·独立样本2", visibility: "PUBLIC" },
  });
  report.notes.push(`pub2 ${pub.status}`);
  pub2Id = pub.json?.id;
  if (pub.status === 201 && pub2Id) {
    const done = await req("POST", `/publications/${pub2Id}/manual-complete`, {
      token,
      body: { externalUrl: "https://example.com/manual-douyin-uat-cycle-c2" },
    });
    report.notes.push(`manualComplete ${done.status}`);
    const publishedAt = new Date(done.json?.publishedAt || Date.now()).getTime();
    const metricBody = {
      views: 820,
      likes: 62,
      comments: 13,
      shares: 4,
      favorites: 10,
      observedAt: new Date(publishedAt + 90_000).toISOString(),
    };
    const m2 = await req("POST", `/publications/${pub2Id}/metrics/manual`, {
      token,
      extraHeaders: { "x-idempotency-key": `c2-m2-${randomUUID()}` },
      body: metricBody,
    });
    report.notes.push(`metrics2 ${m2.status} ${m2.json?.id ?? ""}`);
    report.pass.metrics2 = m2.status === 201;
    report.ids.snapshot2Id = m2.json?.id;

    const listBefore = await req("GET", `/publications/${pub2Id}/metrics`, { token });
    const countBefore = listBefore.json?.items?.length ?? 0;
    const recBefore = await req("GET", `/projects/${ids.projectId}/learning-summary`, { token });
    report.learningAfterPub2 = recBefore.json;
    report.pass.learningLabelRepeated = String(recBefore.json?.statusLabel || "").includes("多次");
    report.pass.recommendation = Array.isArray(recBefore.json?.nextBatchAdjustments) && recBefore.json.nextBatchAdjustments.length > 0;

    const m2dup = await req("POST", `/publications/${pub2Id}/metrics/manual`, {
      token,
      extraHeaders: { "x-idempotency-key": `c2-m2dup-${randomUUID()}` },
      body: metricBody,
    });
    const listAfter = await req("GET", `/publications/${pub2Id}/metrics`, { token });
    const countAfter = listAfter.json?.items?.length ?? 0;
    const recAfter = await req("GET", `/projects/${ids.projectId}/learning-summary`, { token });
    report.pass.duplicateSnapshot = m2.json?.id === m2dup.json?.id && countBefore === countAfter && countBefore === 1;
    report.pass.duplicateLearningStable =
      JSON.stringify(recBefore.json?.nextBatchAdjustments) === JSON.stringify(recAfter.json?.nextBatchAdjustments) &&
      JSON.stringify(recBefore.json?.summary) === JSON.stringify(recAfter.json?.summary);
    report.notes.push(`dup count ${countBefore}->${countAfter} sameId=${m2.json?.id === m2dup.json?.id}`);
  }
}

report.ids.pub1Id = ids.pub1Id;
report.ids.pub2Id = pub2Id;
report.pass.independentPub = Boolean(pub2Id) && pub2Id !== ids.pub1Id;

const insights1 = await req("GET", `/publications/${ids.pub1Id}/metrics/insights`, { token });
const insights2 = pub2Id ? await req("GET", `/publications/${pub2Id}/metrics/insights`, { token }) : { json: null };
report.insightCodes1 = (insights1.json?.insights ?? []).map((r) => r.code);
report.insightCodes2 = (insights2.json?.insights ?? []).map((r) => r.code);

const list1 = await req("GET", `/publications/${ids.pub1Id}/metrics`, { token });
report.snapshotCount1 = list1.json?.items?.length ?? 0;
report.snapshotCount2 = pub2Id ? (await req("GET", `/publications/${pub2Id}/metrics`, { token })).json?.items?.length ?? 0 : 0;

let positioningRunId = null;
const posRuns = await req("GET", `/agents/runs?projectId=${ids.projectId}&agentId=account.positioning`, { token });
const pr = Array.isArray(posRuns.json) ? posRuns.json : [];
positioningRunId = pr.find((r) => r.status === "COMPLETED")?.id ?? null;

let plan2 = { status: 0, json: null };
if (report.pass.independentPub && report.pass.metrics2) {
  plan2 = await req("POST", "/content-plans", {
    token,
    extraHeaders: { "x-request-id": `c2-plan2-${randomUUID()}` },
    body: {
      projectId: ids.projectId,
      planningDays: 7,
      postsPerDay: 1,
      platform: "DOUYIN",
      strategyId: ids.strategyId,
      positioningRunId,
      additionalRequirements: "第二批规划，应吸收已确认学习。",
    },
  });
  report.notes.push(`plan2 ${plan2.status} ${plan2.json?.id ?? plan2.json?.code ?? ""}`);
  report.ids.plan2Id = plan2.json?.id;
  report.pass.plan2 = plan2.status === 201 && plan2.json?.id !== ids.plan1Id;
} else {
  report.notes.push("skip plan2 until independent publication metrics exist");
  report.pass.plan2 = false;
}

if (plan2.json?.sourceAgentRunId) {
  const run = await req("GET", `/agents/runs/${plan2.json.sourceAgentRunId}`, { token });
  const input = run.json?.input ?? {};
  const lc = input.learningContext ?? {};
  const confirmed = Array.isArray(lc.confirmed) ? lc.confirmed : [];
  const pubs = new Set();
  for (const sig of input.performanceFeedback?.positiveSignals ?? []) {
    for (const pid of sig.publicationIds ?? []) pubs.add(pid);
  }
  report.batch2LearningContext = {
    hasLearningContext: Boolean(input.learningContext),
    confirmedCount: confirmed.length,
    maxSupport: confirmed.reduce((m, s) => Math.max(m, s.supportCount ?? 0), 0),
    confirmedKeys: confirmed.map((s) => s.key),
    hasLatestRecommendations: Array.isArray(lc.latestRecommendations) && lc.latestRecommendations.length > 0,
    previousBatchSummary: lc.previousBatchSummary ?? null,
    observedPublicationCount: pubs.size,
    observedPublicationIdsDistinct: pubs.size >= 2 && (!pub2Id || (pubs.has(ids.pub1Id) && pubs.has(pub2Id))),
    publicOutputHasLearningContext: Object.prototype.hasOwnProperty.call(plan2.json?.payload ?? {}, "learningContext"),
  };
  report.pass.batch2 =
    report.batch2LearningContext.hasLearningContext &&
    report.batch2LearningContext.confirmedCount >= 1 &&
    report.batch2LearningContext.maxSupport >= 2 &&
    report.batch2LearningContext.hasLatestRecommendations &&
    Boolean(report.batch2LearningContext.previousBatchSummary) &&
    report.batch2LearningContext.observedPublicationIdsDistinct &&
    report.batch2LearningContext.publicOutputHasLearningContext === false;
  writeFileSync(
    join(outDir, "batch2-learning-context.json"),
    JSON.stringify(
      {
        confirmed: confirmed.map((s) => ({ key: s.key, supportCount: s.supportCount, status: s.status, summary: s.summary })),
        latestRecommendations: lc.latestRecommendations,
        previousBatchSummary: lc.previousBatchSummary,
        observedFrom: [...pubs],
      },
      null,
      2,
    ),
  );
}

const memRefresh = await req("POST", `/projects/${ids.projectId}/memory/refresh`, { token });
const mem = await req("GET", `/projects/${ids.projectId}/memory`, { token });
const ctx = await req("GET", `/projects/${ids.projectId}/memory/context`, { token });
report.memory = {
  refreshStatus: memRefresh.status,
  version: mem.json?.version,
  patternCounts: mem.json?.patternCounts,
  winning: (ctx.json?.winningPatterns ?? []).map((p) => ({ summary: p.summary, supportCount: p.supportCount })),
  performance: (ctx.json?.recentPerformanceSignals ?? []).map((s) => ({
    code: s.code,
    supportCount: s.supportCount,
    direction: s.direction,
  })),
};
const winningKeys = (ctx.json?.winningPatterns ?? []).map((p) => p.summary);
const candidateLike = (ctx.json?.recentPerformanceSignals ?? []).filter((s) => s.supportCount === 1);
const confirmedLike = (ctx.json?.recentPerformanceSignals ?? []).filter((s) => s.supportCount >= 2);
report.pass.memory =
  memRefresh.status === 200 &&
  ((mem.json?.patternCounts?.winning ?? 0) > 0 || confirmedLike.length > 0) &&
  !winningKeys.some((k) => candidateLike.some((c) => k && String(k).includes(c.code)));

report.pass.supportCount2 = report.batch2LearningContext?.maxSupport >= 2;
report.pass.confirmedSignals = (report.batch2LearningContext?.confirmedCount ?? 0) >= 1;
report.pass.observedIndependent = report.batch2LearningContext?.observedPublicationIdsDistinct === true;

report.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    health: report.pass.health,
    export: report.pass.export,
    exportBytes: report.exportBytes,
    video2: report.pass.video2Completed,
    independentVideo: report.pass.independentVideo,
    independentPub: report.pass.independentPub,
    learningLabel: report.pass.learningLabelRepeated,
    rec: report.pass.recommendation,
    dup: report.pass.duplicateSnapshot,
    dupLearn: report.pass.duplicateLearningStable,
    batch2: report.pass.batch2,
    memory: report.pass.memory,
    support2: report.pass.supportCount2,
    notes: report.notes,
    ids: report.ids,
    timelineTypes: report.timelineTypes,
    insightCodes1: report.insightCodes1,
    insightCodes2: report.insightCodes2,
  }),
);

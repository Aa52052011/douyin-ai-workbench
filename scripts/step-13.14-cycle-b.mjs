/**
 * Step 13.14 Fix Cycle B — live mock/local closed-loop UAT harness.
 * Does not print passwords/secrets. Does not modify .env.
 */
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
const api = process.env.UAT_API_URL || "http://127.0.0.1:3001";
const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobeBin = process.env.FFPROBE_PATH || "ffprobe";

mkdirSync(join(outDir, "desktop"), { recursive: true });
mkdirSync(join(outDir, "mobile"), { recursive: true });
mkdirSync(join(outDir, "final-video"), { recursive: true });
mkdirSync(join(outDir, "fixtures"), { recursive: true });

const startedAt = new Date().toISOString();
const defects = [];
const journey = [];
const timings = {};
const providerCalls = {
  routerOne: { real: 0, mock: 0, schemaRepair: 0 },
  wanx: { real: 0, mock: 0 },
  minimax: { real: 0, mock: 0 },
  researchExternal: 0,
  digitalHuman: 0,
  voiceClone: 0,
  aiVideo: 0,
};

function note(step, ok, detail) {
  journey.push({ step, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} ${detail ?? ""}`);
  if (!ok) defects.push({ step, severity: "P1", detail });
}

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function req(method, path, { token, body, extraHeaders, form } = {}) {
  const init = { method, headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  if (extraHeaders) Object.assign(init.headers, extraHeaders);
  const res = await fetch(`${api}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text, headers: res.headers };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

async function ensureFixtures() {
  const image = join(outDir, "fixtures/cafe.png");
  const video = join(outDir, "fixtures/clip.mp4");
  const ref = join(outDir, "fixtures/ref.png");
  if (!existsSync(image)) {
    await run(ffmpegBin, ["-y", "-f", "lavfi", "-i", "color=c=0xC4A574:s=1080x1920:d=1", "-frames:v", "1", image]);
  }
  if (!existsSync(video)) {
    await run(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=1080x1920:rate=30:duration=2",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-t",
      "2",
      video,
    ]);
  }
  if (!existsSync(ref)) {
    await run(ffmpegBin, ["-y", "-f", "lavfi", "-i", "color=c=0x336699:s=640x360:d=1", "-frames:v", "1", ref]);
  }
  return { image, video, ref };
}

async function uploadAsset(token, projectId, filePath, mime, name, { referenceOnly, rightsConfirmed }) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("referenceOnly", referenceOnly ? "true" : "false");
  form.append("rightsConfirmed", rightsConfirmed ? "true" : "false");
  form.append("file", new Blob([buf], { type: mime }), name);
  return req("POST", "/assets/upload", { token, form });
}

async function waitVideo(token, videoId, timeoutMs = 480_000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await req("GET", `/videos/${videoId}`, { token });
    const status = last.json?.status;
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
      return last;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return last;
}

async function ffprobeJson(file) {
  const out = await run(ffprobeBin, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  try {
    return JSON.parse(out.stdout || "{}");
  } catch {
    return { error: out.stderr.slice(0, 500) };
  }
}

async function main() {
  const runtime = { api, startedAt };
  const health = await req("GET", "/health");
  runtime.health = { status: health.status, body: health.json };
  note("preflight.health", health.status === 200, `http ${health.status}`);

  const cap = await req("GET", "/projects/placeholder/research-capability").catch(() => ({ status: 0 }));
  void cap;

  const fixtures = await ensureFixtures();
  runtime.fixtures = {
    image: existsSync(fixtures.image),
    video: existsSync(fixtures.video),
    ref: existsSync(fixtures.ref),
  };

  const tag = randomUUID().slice(0, 8);
  const emailA = `uat-cycle-b-${tag}@example.com`;
  const emailB = `uat-cycle-b-t2-${tag}@example.com`;
  const password = "UatCycleB12!";
  const nameA = "UAT闭环创作者";
  const nameB = "UAT租户B";

  const regA = await req("POST", "/auth/register", {
    body: { email: emailA, password, name: nameA },
  });
  note("register.A", regA.status === 201, `http ${regA.status}`);
  if (regA.status !== 201) {
    writeArtifacts({ runtime, journey, defects, error: "register A failed" });
    process.exit(1);
  }
  const tokenA = regA.json.accessToken;
  const tenantA = regA.json.tenant?.id;
  const workspaceA = regA.json.workspace?.id ?? regA.json.defaultWorkspace?.id;

  writeFileSync(
    join(outDir, "credentials.json"),
    JSON.stringify({ emailA, emailB, nameA, nameB, password, tenantA, workspaceA }, null, 2),
  );

  const projA = await req("POST", "/projects", {
    token: tokenA,
    body: { name: "UAT咖啡店闭环", industry: "餐饮", platform: "douyin", description: "本地咖啡店获客到店闭环" },
  });
  note("project.A", projA.status === 201, projA.json?.id);
  const projectId = projA.json.id;
  const projB = await req("POST", "/projects", {
    token: tokenA,
    body: { name: "UAT隔离B", industry: "餐饮", platform: "douyin" },
  });
  note("project.B", projB.status === 201, projB.json?.id);
  const isolationId = projB.json.id;

  const turnId = `turn-${tag}-01`;
  const intake = await req("POST", `/projects/${projectId}/intake/product/turn`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `pi-${tag}` },
    body: {
      clientTurnId: turnId,
      userMessage:
        "本地咖啡店，目标获客到店，受众附近上班族和年轻用户，行业餐饮咖啡。招牌美式和手冲，强调通勤路过就能买到新鲜咖啡。",
      draft: {
        productName: "街角手冲咖啡",
        industry: "餐饮/咖啡",
        businessGoal: "获客/到店",
        targetAudience: "附近上班族/年轻用户",
      },
      messages: [],
    },
  });
  note("product.intake.turn", intake.status < 400, `http ${intake.status}`);

  const brief = await req("POST", `/projects/${projectId}/product-briefs`, {
    token: tokenA,
    body: {
      productName: "街角手冲咖啡",
      industry: "餐饮/咖啡",
      businessGoal: "获客/到店",
      category: "本地餐饮",
      targetAudience: "附近上班族/年轻用户",
      sellingPoints: ["通勤路过即可买到", "手冲新鲜", "到店优惠"],
      seedKeywords: ["附近咖啡", "上班咖啡", "手冲"],
      conversionGoal: "到店核销",
      goalCode: "LEAD_GENERATION",
    },
  });
  note("product.brief.save", brief.status === 201, brief.json?.id);
  const briefId = brief.json?.id;

  const marketTurn = await req("POST", `/projects/${projectId}/intake/market/turn`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `mi-turn-${tag}` },
    body: {
      clientTurnId: `mturn-${tag}-01`,
      userMessage: "关键词：附近咖啡、上班咖啡、手冲。竞品：两街区外连锁咖啡。参考：本地探店视频描述。",
      draft: {
        keywords: ["附近咖啡", "上班咖啡", "手冲"],
        competitors: ["两街区连锁咖啡"],
        referenceUrl: "https://example.com/local-cafe-review",
      },
      messages: [],
    },
  });
  note("market.intake.turn", marketTurn.status < 400, `http ${marketTurn.status}`);

  const researchCap = await req("GET", `/projects/${projectId}/research-capability`, { token: tokenA });
  runtime.researchCapability = researchCap.json;
  const researchReq = await req("POST", `/projects/${projectId}/research`, {
    token: tokenA,
    body: { platform: "douyin", refresh: false },
  });
  const researchStatus = researchReq.json?.status || researchReq.json?.request?.status || researchReq.json?.code;
  note("research.request", researchReq.status < 500, `http ${researchReq.status} status=${researchStatus}`);
  runtime.researchRequest = { http: researchReq.status, bodyKeys: researchReq.json ? Object.keys(researchReq.json) : [], status: researchStatus };

  const positioning = await req("POST", "/agents/runs", {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `pos-${tag}` },
    body: {
      agentId: "account.positioning",
      agentVersion: "v1",
      projectId,
      input: {
        industry: "餐饮/咖啡",
        platform: "douyin",
        accountType: "本地商家",
        goal: "帮助附近上班族养成到店买咖啡的习惯",
      },
    },
  });
  note("positioning", positioning.status === 201, positioning.json?.id);
  const positioningRunId = positioning.json?.id;

  const confirmedResearch = await req("POST", `/projects/${projectId}/market-research/confirm`, {
    token: tokenA,
    body: {
      collectedAt: new Date().toISOString(),
      items: [
        {
          kind: "KEYWORD",
          platform: "douyin",
          keyword: "附近咖啡",
          relatedKeywords: ["上班咖啡"],
          volumeSignal: "high",
          competitionSignal: "medium",
        },
        {
          kind: "KEYWORD",
          platform: "douyin",
          keyword: "上班咖啡",
          relatedKeywords: ["手冲"],
          volumeSignal: "medium",
          competitionSignal: "medium",
        },
        {
          kind: "KEYWORD",
          platform: "douyin",
          keyword: "手冲",
          relatedKeywords: ["附近咖啡"],
          volumeSignal: "medium",
          competitionSignal: "low",
        },
        {
          kind: "COMPETITOR",
          platform: "douyin",
          displayName: "两街区连锁咖啡",
          followerCount: 8000,
          contentThemes: ["通勤咖啡"],
        },
        {
          kind: "CONTENT",
          platform: "douyin",
          title: "附近上班族探店手冲",
          externalContentId: `uat-ref-${tag}`,
          views: 1200,
          likes: 90,
          comments: 12,
          shares: 4,
          favorites: 20,
          hashtags: ["附近咖啡"],
          keywords: ["附近咖啡", "手冲"],
        },
      ],
    },
  });
  note("market.research.confirm", confirmedResearch.status === 201, confirmedResearch.json?.id);
  const marketResearchId = confirmedResearch.json?.id;

  const insights = await req("POST", `/market-research/${marketResearchId}/insights`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `ins-${tag}` },
    body: {},
  });
  note("market.intelligence", insights.status === 201, insights.json?.insight?.id);
  providerCalls.routerOne.mock += 1;
  const insightPayload = insights.json?.insight?.payload;

  const strategy = await req("POST", `/projects/${projectId}/campaign-strategies/generate`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `cs-${tag}` },
    body: {
      productBriefId: briefId,
      positioningRunId,
      userGoal: "获客到店，不做硬广转化压单",
    },
  });
  note("strategy.generate", strategy.status === 201, `${strategy.json?.strategy?.status} v${strategy.json?.strategy?.version}`);
  providerCalls.routerOne.mock += 1;
  const strategyId = strategy.json?.strategy?.id;
  const strategyVersion = strategy.json?.strategy?.version;
  const strategyHash = strategy.json?.strategy?.hash ?? strategy.json?.strategy?.contentHash ?? strategy.json?.strategy?.inputHash;

  const plan1 = await req("POST", "/content-plans", {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `cp1-${tag}` },
    body: {
      projectId,
      planningDays: 7,
      postsPerDay: 1,
      platform: "douyin",
      positioningRunId,
      strategyId,
      additionalRequirements: "本批内容：本地咖啡到店获客，优先通勤路过主题。",
    },
  });
  note("batch1.create", plan1.status === 201, plan1.json?.id || plan1.text?.slice(0, 240));
  if (plan1.status !== 201) {
    writeArtifacts({ runtime, journey, defects, providerCalls });
    throw new Error(`batch1.create failed http ${plan1.status}`);
  }
  providerCalls.routerOne.mock += 1;
  const plan1Id = plan1.json?.id;
  const topics = plan1.json?.payload?.topics ?? [];
  const confirmPlan = await req("POST", `/content-plans/${plan1Id}/confirm`, { token: tokenA });
  note("batch1.confirm", confirmPlan.status === 200, confirmPlan.json?.status);

  const topicId = topics[0]?.id;
  const script = await req("POST", "/scripts", {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `sc-${tag}` },
    body: { contentPlanId: plan1Id, topicId, targetDuration: 15 },
  });
  note("script.generate", script.status === 201, script.json?.id);
  providerCalls.routerOne.mock += 1;
  const scriptId = script.json?.id;
  const patchedTitle = `${script.json?.title || "通勤手冲"}（人工改）`;
  const patch = await req("PATCH", `/scripts/${scriptId}`, {
    token: tokenA,
    body: { title: patchedTitle },
  });
  if (patch.status === 404 || patch.status === 405) {
    const put = await req("PUT", `/scripts/${scriptId}`, { token: tokenA, body: { title: patchedTitle } });
    note("script.edit", put.status < 400, `http ${put.status}`);
  } else {
    note("script.edit", patch.status < 400, `http ${patch.status}`);
  }
  const confirmScript = await req("POST", `/scripts/${scriptId}/confirm`, { token: tokenA });
  note("script.confirm", confirmScript.status === 200, confirmScript.json?.status);

  const imgUp = await uploadAsset(tokenA, projectId, fixtures.image, "image/png", "cafe.png", {
    referenceOnly: false,
    rightsConfirmed: true,
  });
  note("asset.image", imgUp.status < 400, imgUp.json?.id);
  const vidUp = await uploadAsset(tokenA, projectId, fixtures.video, "video/mp4", "clip.mp4", {
    referenceOnly: false,
    rightsConfirmed: true,
  });
  note("asset.video", vidUp.status < 400, vidUp.json?.id);
  const refUp = await uploadAsset(tokenA, projectId, fixtures.ref, "image/png", "ref.png", {
    referenceOnly: true,
    rightsConfirmed: false,
  });
  note("asset.reference", refUp.status < 400 && (refUp.json?.referenceOnly === true || refUp.json?.sourceType === "REFERENCE"), `id=${refUp.json?.id} ref=${refUp.json?.referenceOnly}`);

  const imageAssetId = imgUp.json?.id;
  const videoAssetId = vidUp.json?.id;
  const refAssetId = refUp.json?.id;

  const tScriptConfirm = Date.now();
  const videoCreate = await req("POST", "/videos", {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `vid-${tag}` },
    body: {
      scriptId,
      targetDuration: 15,
      aspectRatio: "9:16",
      resolution: "1080x1920",
      preferences: {
        preferRealFootage: true,
        allowAiImage: true,
        allowAiVideo: false,
        allowDigitalHuman: false,
      },
      preferredAssetIds: [imageAssetId, videoAssetId].filter(Boolean),
    },
  });
  note("video.create", videoCreate.status === 201, videoCreate.json?.id || videoCreate.text?.slice(0, 200));
  const videoId = videoCreate.json?.id;
  const sourceJobId = videoCreate.json?.sourceJobId;
  if (!videoId) {
    writeArtifacts({ runtime, journey, defects, providerCalls });
    throw new Error(`video.create failed http ${videoCreate.status}`);
  }

  const done = await waitVideo(tokenA, videoId);
  timings.scriptConfirmToFinalMs = Date.now() - tScriptConfirm;
  note("video.complete", done?.json?.status === "COMPLETED", done?.json?.status);
  const outputAssetId = done?.json?.outputAssetId;
  const draftAssetId = done?.json?.draftAssetId ?? done?.json?.composeAssetId;

  const planView = await req("GET", `/videos/${videoId}/production-plan`, { token: tokenA });
  const timeline = await req("GET", `/videos/${videoId}/timeline`, { token: tokenA });
  const quality = await req("GET", `/videos/${videoId}/quality`, { token: tokenA });
  const usage1 = await req("GET", `/videos/${videoId}/usage-summary`, { token: tokenA });
  runtime.director = planView.json;
  runtime.timeline = summarizeTimeline(timeline.json);
  runtime.quality = quality.json;
  runtime.usageAfterProduce = usage1.json;

  const exportRes = await fetch(`${api}/videos/${videoId}/export`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const mp4Path = join(outDir, "final-video", `${videoId}.mp4`);
  if (exportRes.ok) {
    const buf = Buffer.from(await exportRes.arrayBuffer());
    writeFileSync(mp4Path, buf);
    note("final.export", buf.length > 0, `${buf.length} bytes`);
    runtime.ffprobe = await ffprobeJson(mp4Path);
    const vs = (runtime.ffprobe.streams || []).find((s) => s.codec_type === "video");
    const as = (runtime.ffprobe.streams || []).find((s) => s.codec_type === "audio");
    runtime.ffprobeSummary = {
      width: vs?.width,
      height: vs?.height,
      vcodec: vs?.codec_name,
      acodec: as?.codec_name,
      fps: vs?.r_frame_rate,
      duration: runtime.ffprobe.format?.duration,
      size: runtime.ffprobe.format?.size,
    };
    await run(ffmpegBin, ["-y", "-ss", "0.3", "-i", mp4Path, "-frames:v", "1", join(outDir, "final-video", "frame-open.jpg")]);
    await run(ffmpegBin, ["-y", "-ss", "1.2", "-i", mp4Path, "-frames:v", "1", join(outDir, "final-video", "frame-mid.jpg")]);
    await run(ffmpegBin, ["-y", "-sseof", "-0.8", "-i", mp4Path, "-frames:v", "1", join(outDir, "final-video", "frame-end.jpg")]);
  } else {
    note("final.export", false, `http ${exportRes.status}`);
  }

  let usage2 = usage1;
  if (done?.json?.status === "COMPLETED") {
    const retry = await req("POST", `/videos/${videoId}/retry`, {
      token: tokenA,
      extraHeaders: { "x-request-id": `retry-${tag}` },
    });
    note("retry.start", retry.status < 400, `http ${retry.status}`);
    if (retry.status < 400) {
      const retryDone = await waitVideo(tokenA, videoId, 240_000);
      note("retry.complete", retryDone?.json?.status === "COMPLETED", retryDone?.json?.status);
    }
    usage2 = await req("GET", `/videos/${videoId}/usage-summary`, { token: tokenA });
    runtime.usageAfterRetry = usage2.json;

    const regen = await req("POST", `/videos/${videoId}/production-plan`, {
      token: tokenA,
      body: { regenerate: true, preferences: { preferRealFootage: true, allowAiImage: true } },
    });
    note("regenerate.plan", regen.status < 400, `http ${regen.status} gen=${regen.json?.generationVersion}`);
    if (regen.status < 400) {
      const regenWait = await waitVideo(tokenA, videoId, 240_000);
      note("regenerate.complete", regenWait?.json?.status === "COMPLETED", regenWait?.json?.status);
    }
  } else {
    note("retry.start", false, "skipped; video not COMPLETED");
  }

  const pub1 = await req("POST", `/videos/${videoId}/publications`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `pub1-${tag}` },
    body: {
      platform: "DOUYIN",
      mode: "MANUAL",
      title: "街角手冲·通勤到店",
      visibility: "PUBLIC",
    },
  });
  note("publication.create", pub1.status === 201, pub1.json?.status);
  const pub1Id = pub1.json?.id;
  const completedPub = await req("POST", `/publications/${pub1Id}/manual-complete`, {
    token: tokenA,
    body: { externalUrl: "https://example.com/manual-douyin-uat-cycle-b-1" },
  });
  note("publication.manual", completedPub.status === 200 && completedPub.json?.status === "PUBLISHED", completedPub.json?.status);

  const publishedAt = new Date(completedPub.json?.publishedAt || Date.now()).getTime();
  const metrics1 = await req("POST", `/publications/${pub1Id}/metrics/manual`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `m1-${tag}` },
    body: {
      views: 800,
      likes: 60,
      comments: 8,
      shares: 3,
      favorites: 12,
      completionRate: 0.41,
      observedAt: new Date(publishedAt + 60_000).toISOString(),
    },
  });
  note("metrics.1", metrics1.status === 201, metrics1.json?.views);
  const learn1 = await req("GET", `/projects/${projectId}/learning-summary`, { token: tokenA });
  runtime.learningN1 = learn1.json;
  note("learning.n1", learn1.status === 200, JSON.stringify(learn1.json?.statusLabel || learn1.json?.label || "").slice(0, 80));

  const metrics1b = await req("POST", `/publications/${pub1Id}/metrics/manual`, {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `m1b-${tag}` },
    body: {
      views: 800,
      likes: 60,
      comments: 8,
      shares: 3,
      favorites: 12,
      completionRate: 0.41,
      observedAt: new Date(publishedAt + 60_000).toISOString(),
    },
  });
  runtime.duplicateMetrics = { http: metrics1b.status, id: metrics1b.json?.id, same: metrics1b.json?.id === metrics1.json?.id };
  const learnDup = await req("GET", `/projects/${projectId}/learning-summary`, { token: tokenA });
  runtime.learningAfterDup = learnDup.json;

  let video2Id = null;
  let pub2Id = null;
  if (topics[1]?.id) {
    const script2 = await req("POST", "/scripts", {
      token: tokenA,
      extraHeaders: { "x-idempotency-key": `sc2-${tag}` },
      body: { contentPlanId: plan1Id, topicId: topics[1].id, targetDuration: 12 },
    });
    if (script2.status === 201) {
      await req("POST", `/scripts/${script2.json.id}/confirm`, { token: tokenA });
      const v2 = await req("POST", "/videos", {
        token: tokenA,
        extraHeaders: { "x-idempotency-key": `vid2-${tag}` },
        body: {
          scriptId: script2.json.id,
          targetDuration: 12,
          preferences: { preferRealFootage: true, allowAiImage: true, allowAiVideo: false },
          preferredAssetIds: [imageAssetId, videoAssetId].filter(Boolean),
        },
      });
      if (v2.status === 201) {
        video2Id = v2.json.id;
        const v2done = await waitVideo(tokenA, video2Id);
        note("video2.complete", v2done?.json?.status === "COMPLETED", v2done?.json?.status);
        if (v2done?.json?.status === "COMPLETED") {
          const pub2 = await req("POST", `/videos/${video2Id}/publications`, {
            token: tokenA,
            extraHeaders: { "x-idempotency-key": `pub2-${tag}` },
            body: { platform: "DOUYIN", mode: "MANUAL", title: "手冲到店第二弹", visibility: "PUBLIC" },
          });
          pub2Id = pub2.json?.id;
          const c2 = await req("POST", `/publications/${pub2Id}/manual-complete`, {
            token: tokenA,
            body: { externalUrl: "https://example.com/manual-douyin-uat-cycle-b-2" },
          });
          const p2 = new Date(c2.json?.publishedAt || Date.now()).getTime();
          await req("POST", `/publications/${pub2Id}/metrics/manual`, {
            token: tokenA,
            extraHeaders: { "x-idempotency-key": `m2-${tag}` },
            body: {
              views: 920,
              likes: 70,
              comments: 9,
              shares: 4,
              favorites: 14,
              completionRate: 0.44,
              observedAt: new Date(p2 + 90_000).toISOString(),
            },
          });
          note("publication.2", c2.status === 200, c2.json?.status);
        }
      }
    }
  }

  const learn2 = await req("GET", `/projects/${projectId}/learning-summary`, { token: tokenA });
  runtime.learningN2 = learn2.json;
  const memory = await req("GET", `/projects/${projectId}/memory`, { token: tokenA });
  runtime.memory = memory.json;
  const strategyAfter = await req("GET", `/projects/${projectId}/campaign-strategies/latest`, { token: tokenA });
  runtime.strategyAfter = {
    id: strategyAfter.json?.id ?? strategyAfter.json?.strategy?.id,
    version: strategyAfter.json?.version ?? strategyAfter.json?.strategy?.version,
    hash: strategyAfter.json?.hash ?? strategyAfter.json?.strategy?.hash,
  };
  note(
    "strategy.unchanged",
    (runtime.strategyAfter.version ?? strategyVersion) === strategyVersion,
    `before=${strategyVersion} after=${runtime.strategyAfter.version}`,
  );

  const plan2 = await req("POST", "/content-plans", {
    token: tokenA,
    extraHeaders: { "x-idempotency-key": `cp2-${tag}` },
    body: {
      projectId,
      planningDays: 7,
      postsPerDay: 1,
      platform: "douyin",
      positioningRunId,
      strategyId,
      additionalRequirements: "结合学习建议继续测试到店开头和附近咖啡主题。",
    },
  });
  note("batch2.create", plan2.status === 201, plan2.json?.id);
  runtime.batch2 = { id: plan2.json?.id, hasPayload: Boolean(plan2.json?.payload) };

  const isoVideos = await req("GET", `/videos?projectId=${isolationId}`, { token: tokenA });
  const isoAssets = await req("GET", `/assets?projectId=${isolationId}`, { token: tokenA });
  const isoPlans = await req("GET", `/content-plans?projectId=${isolationId}`, { token: tokenA });
  runtime.isolationB = {
    videos: countList(isoVideos.json),
    assets: countList(isoAssets.json),
    plans: countList(isoPlans.json),
  };
  note("isolation.projectB", runtime.isolationB.videos === 0 && runtime.isolationB.plans === 0, JSON.stringify(runtime.isolationB));

  const regB = await req("POST", "/auth/register", { body: { email: emailB, password, name: nameB } });
  note("register.B", regB.status === 201, `http ${regB.status}`);
  const tokenB = regB.json?.accessToken;
  const crossProject = await req("GET", `/projects/${projectId}`, { token: tokenB });
  const crossVideo = await req("GET", `/videos/${videoId}`, { token: tokenB });
  const crossAsset = imageAssetId ? await req("GET", `/assets/${imageAssetId}`, { token: tokenB }) : { status: 0 };
  runtime.tenantIsolation = { project: crossProject.status, video: crossVideo.status, asset: crossAsset.status };
  note(
    "tenant.isolation",
    [crossProject.status, crossVideo.status, crossAsset.status].every((s) => s === 404 || s === 403 || s === 401),
    JSON.stringify(runtime.tenantIsolation),
  );

  const logout = await req("POST", "/auth/logout", { token: tokenA });
  note("auth.logout", logout.status < 400 || logout.status === 204, `http ${logout.status}`);
  const relogin = await req("POST", "/auth/login", { body: { email: emailA, password } });
  note("auth.login", relogin.status === 200 || relogin.status === 201, `http ${relogin.status}`);

  writeFileSync(
    join(outDir, "ids.json"),
    JSON.stringify(
      {
        emailA,
        emailB,
        projectId,
        isolationId,
        videoId,
        video2Id,
        pub1Id,
        pub2Id,
        plan1Id,
        plan2Id: plan2.json?.id,
        scriptId,
        imageAssetId,
        videoAssetId,
        refAssetId,
        outputAssetId,
        sourceJobId,
        strategyId,
        strategyVersion,
        strategyHash,
        briefId,
      },
      null,
      2,
    ),
  );

  runtime.finishedAt = new Date().toISOString();
  runtime.timings = timings;
  writeArtifacts({
    runtime,
    journey,
    defects,
    providerCalls,
    usage: { afterProduce: usage1.json, afterRetry: usage2.json },
    insightPayload,
    ids: JSON.parse(readFileSync(join(outDir, "ids.json"), "utf8")),
  });
}

function countList(json) {
  if (Array.isArray(json)) return json.length;
  if (Array.isArray(json?.items)) return json.items.length;
  if (Array.isArray(json?.data)) return json.data.length;
  return json?.total ?? 0;
}

function summarizeTimeline(json) {
  const tracks = json?.tracks ?? json?.timeline?.tracks ?? json;
  const visual = tracks?.visual ?? [];
  return {
    visualCount: Array.isArray(visual) ? visual.length : 0,
    types: Array.isArray(visual) ? [...new Set(visual.map((v) => v.assetType || v.type))] : [],
    durationMs: json?.durationMs ?? json?.timeline?.durationMs,
    voiceAssetId: json?.metadata?.voiceAssetId ?? json?.voiceAssetId,
    subtitleAssetId: json?.metadata?.subtitleAssetId ?? json?.subtitleAssetId,
  };
}

function writeArtifacts(bundle) {
  writeFileSync(join(outDir, "runtime.json"), JSON.stringify(bundle.runtime, null, 2));
  writeFileSync(join(outDir, "journey.json"), JSON.stringify(bundle.journey, null, 2));
  writeFileSync(join(outDir, "defects.json"), JSON.stringify(bundle.defects ?? defects, null, 2));
  writeFileSync(join(outDir, "provider-calls.json"), JSON.stringify(bundle.providerCalls ?? providerCalls, null, 2));
  writeFileSync(join(outDir, "usage-summary.json"), JSON.stringify(bundle.usage ?? {}, null, 2));
}

main().catch((err) => {
  defects.push({ step: "harness", severity: "P0", detail: String(err?.stack || err) });
  writeArtifacts({ runtime: { error: String(err) }, journey, defects, providerCalls });
  process.exit(1);
});

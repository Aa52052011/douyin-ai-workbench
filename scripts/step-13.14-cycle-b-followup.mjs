/**
 * Cycle B follow-up: timeline dump, video2+pub2, learning, research body.
 * Reads credentials from .local (not printed).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
const api = "http://127.0.0.1:3001";
const cred = JSON.parse(readFileSync(join(dir, "credentials.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8"));

async function req(method, path, { token, body } = {}) {
  const headers = {};
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
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function waitVideo(token, videoId, timeoutMs = 180_000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await req("GET", `/videos/${videoId}`, { token });
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(last.json?.status)) return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

const login = await req("POST", "/auth/login", { body: { email: cred.emailA, password: cred.password } });
if (login.status >= 400) {
  console.log("FAIL login", login.status);
  process.exit(1);
}
const token = login.json.accessToken;
const out = { startedAt: new Date().toISOString() };

out.researchLatest = (await req("GET", `/projects/${ids.projectId}/research/latest`, { token })).json;
out.timeline = (await req("GET", `/videos/${ids.videoId}/timeline`, { token })).json;
out.quality = (await req("GET", `/videos/${ids.videoId}/quality`, { token })).json;
out.director = (await req("GET", `/videos/${ids.videoId}/production-plan`, { token })).json;
out.plan1 = (await req("GET", `/content-plans/${ids.plan1Id}`, { token })).json;
out.plan2 = (await req("GET", `/content-plans/${ids.plan2Id}`, { token })).json;

const topics = out.plan1?.payload?.topics ?? [];
out.topicCount = topics.length;
const topic2 = topics.find((t) => t.id && t.id !== ids.scriptId) ?? topics[1];
out.topic2Id = topic2?.id;

if (topic2?.id) {
  const script2 = await req("POST", "/scripts", {
    token,
    body: { contentPlanId: ids.plan1Id, topicId: topic2.id, targetDuration: 12 },
  });
  out.script2 = { status: script2.status, id: script2.json?.id };
  if (script2.status === 201) {
    await req("POST", `/scripts/${script2.json.id}/confirm`, { token });
    const v2 = await req("POST", "/videos", {
      token,
      body: {
        scriptId: script2.json.id,
        targetDuration: 12,
        preferences: { preferRealFootage: true, allowAiImage: true, allowAiVideo: false },
        preferredAssetIds: [ids.imageAssetId, ids.videoAssetId],
      },
    });
    out.video2create = { status: v2.status, id: v2.json?.id };
    if (v2.json?.id) {
      const done = await waitVideo(token, v2.json.id);
      out.video2 = { status: done.json?.status, id: v2.json.id };
      if (done.json?.status === "COMPLETED") {
        const pub2 = await req("POST", `/videos/${v2.json.id}/publications`, {
          token,
          body: { platform: "DOUYIN", mode: "MANUAL", title: "手冲到店第二弹", visibility: "PUBLIC" },
        });
        const c2 = await req("POST", `/publications/${pub2.json.id}/manual-complete`, {
          token,
          body: { externalUrl: "https://example.com/manual-douyin-uat-cycle-b-2" },
        });
        const p2 = new Date(c2.json?.publishedAt || Date.now()).getTime();
        await req("POST", `/publications/${pub2.json.id}/metrics/manual`, {
          token,
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
        out.pub2 = { id: pub2.json?.id, status: c2.json?.status };
      }
    }
  }
}

out.learning = (await req("GET", `/projects/${ids.projectId}/learning-summary`, { token })).json;
out.memory = (await req("GET", `/projects/${ids.projectId}/memory`, { token })).json;
out.usage = (await req("GET", `/videos/${ids.videoId}/usage-summary`, { token })).json;
out.plan2InputHint = {
  hasPayload: Boolean(out.plan2?.payload),
  topicCount: out.plan2?.payload?.topics?.length,
  title: out.plan2?.title,
};

writeFileSync(join(dir, "followup.json"), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      timelineShots: out.timeline?.shots,
      reused: out.timeline?.reusedAssetCount,
      generated: out.timeline?.generatedShotCount,
      researchStatus: out.researchLatest?.statusLabel,
      video2: out.video2,
      pub2: out.pub2,
      learning: out.learning?.statusLabel,
      nextAdj: out.learning?.nextBatchAdjustments,
      memCandidates: out.memory?.patternCounts,
      memVersion: out.memory?.version,
    },
    null,
    2,
  ),
);

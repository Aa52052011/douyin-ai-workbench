import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../.local/step-13.14-acceptance/fix-cycle-b");
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
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function waitVideo(token, videoId) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 180000) {
    last = await req("GET", `/videos/${videoId}`, { token });
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(last.json?.status)) return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

const login = await req("POST", "/auth/login", { body: { email: cred.emailA, password: cred.password } });
const token = login.json.accessToken;
const regen = await req("POST", `/videos/${ids.videoId}/production-plan`, {
  token,
  body: { regenerate: true, preferences: { preferRealFootage: true, allowAiImage: true } },
});
const done = await waitVideo(token, ids.videoId);
const timeline = await req("GET", `/videos/${ids.videoId}/timeline`, { token });
const plan1 = await req("GET", `/content-plans/${ids.plan1Id}`, { token });
const topic2 = (plan1.json?.payload?.topics ?? []).find((t) => t.id !== "63ac8ef3-c0f2-4df7-aee2-ee44a0bc39fa") ?? plan1.json?.payload?.topics?.[1];
let script2 = await req("POST", "/scripts", {
  token,
  body: { contentPlanId: ids.plan1Id, topicId: topic2?.id, targetDuration: 15 },
});
const out = {
  regen: regen.status,
  video: done.json?.status,
  gen: timeline.json,
  script2: { status: script2.status, body: script2.json },
};
if (script2.status === 201) {
  await req("POST", `/scripts/${script2.json.id}/confirm`, { token });
  const v2 = await req("POST", "/videos", {
    token,
    body: {
      scriptId: script2.json.id,
      targetDuration: 15,
      preferences: { preferRealFootage: true, allowAiImage: true },
      preferredAssetIds: [ids.imageAssetId, ids.videoAssetId],
    },
  });
  const d2 = v2.json?.id ? await waitVideo(token, v2.json.id) : null;
  out.video2 = { status: v2.status, id: v2.json?.id, done: d2?.json?.status };
  if (d2?.json?.status === "COMPLETED") {
    const pub2 = await req("POST", `/videos/${v2.json.id}/publications`, {
      token,
      body: { platform: "DOUYIN", mode: "MANUAL", title: "手冲第二弹", visibility: "PUBLIC" },
    });
    const c2 = await req("POST", `/publications/${pub2.json.id}/manual-complete`, {
      token,
      body: { externalUrl: "https://example.com/manual-douyin-uat-2" },
    });
    const t = new Date(c2.json?.publishedAt || Date.now()).getTime();
    await req("POST", `/publications/${pub2.json.id}/metrics/manual`, {
      token,
      body: { views: 920, likes: 70, comments: 9, observedAt: new Date(t + 90000).toISOString() },
    });
    out.pub2 = c2.json?.status;
  }
}
out.learning = (await req("GET", `/projects/${ids.projectId}/learning-summary`, { token })).json;
writeFileSync(join(dir, "regen.json"), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify({
    video: out.video,
    shots: timeline.json?.shots,
    reused: timeline.json?.reusedAssetCount,
    generated: timeline.json?.generatedShotCount,
    script2: out.script2?.status,
    video2: out.video2,
    learning: out.learning?.statusLabel,
    next: out.learning?.nextBatchAdjustments,
  }),
);

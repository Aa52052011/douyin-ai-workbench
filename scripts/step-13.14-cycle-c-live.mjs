/**
 * Cycle C live recheck against local mock/ffmpeg runtime.
 * Reads Cycle B credentials; does not print secrets.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.14-acceptance/fix-cycle-c");
const bDir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "final-video"), { recursive: true });

const api = process.env.UAT_API_URL || "http://127.0.0.1:3001";
const cred = JSON.parse(readFileSync(join(bDir, "credentials.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(bDir, "ids.json"), "utf8"));
const report = { startedAt: new Date().toISOString(), notes: [], pass: {} };

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
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
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

const login = await req("POST", "/auth/login", {
  body: { email: cred.emailA, password: cred.password },
});
if (login.status >= 400 || !login.json?.accessToken) {
  report.pass.login = false;
  report.notes.push(`login ${login.status}`);
  writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
  process.exit(1);
}
const token = login.json.accessToken;
report.pass.login = true;

const intake = await req("POST", `/projects/${ids.projectId}/intake/market/turn`, {
  token,
  extraHeaders: { "x-request-id": `c-intake-${randomUUID()}` },
  body: {
    clientTurnId: randomUUID(),
    userMessage: "我想看看手冲咖啡到店转化和附近上班族这两个方向。",
    draft: {
      keywords: ["手冲咖啡", "到店"],
      competitors: ["邻家咖啡"],
      referenceUrl: "https://example.com/coffee-ref",
    },
    messages: [],
  },
});
report.pass.marketIntake = intake.status === 200 || intake.status === 201;
report.notes.push(`marketIntake ${intake.status}`);

const retryCompleted = await req("POST", `/videos/${ids.videoId}/retry`, {
  token,
  extraHeaders: { "x-request-id": `c-retry-${randomUUID()}` },
});
report.pass.completedRetry409 = retryCompleted.status === 409;
report.notes.push(`completedRetry ${retryCompleted.status}`);

const observedAt = new Date().toISOString();
const metricBody = {
  views: 800,
  likes: 60,
  comments: 12,
  shares: 4,
  favorites: 10,
  observedAt,
};
const m1 = await req("POST", `/publications/${ids.pub1Id}/metrics/manual`, {
  token,
  extraHeaders: { "x-idempotency-key": `c-m1-${randomUUID()}` },
  body: metricBody,
});
const m1b = await req("POST", `/publications/${ids.pub1Id}/metrics/manual`, {
  token,
  extraHeaders: { "x-idempotency-key": `c-m1b-${randomUUID()}` },
  body: metricBody,
});
report.pass.duplicateSnapshot = m1.status === 201 && m1b.status === 201 && m1.json?.id === m1b.json?.id;
report.notes.push(`dupMetrics ${m1.status}/${m1b.status} same=${m1.json?.id === m1b.json?.id}`);

const learn1 = await req("GET", `/projects/${ids.projectId}/learning-summary`, { token });
report.learningN1 = learn1.json;
report.pass.n1 =
  learn1.status === 200 &&
  Array.isArray(learn1.json?.summary) &&
  learn1.json.summary.length > 0 &&
  String(learn1.json.statusLabel || "").includes("初步迹象");
report.notes.push(`n1 ${learn1.json?.statusLabel}`);

const pub2 = await req("POST", `/videos/${ids.videoId}/publications`, {
  token,
  extraHeaders: { "x-idempotency-key": `c-pub2-${randomUUID()}` },
  body: { platform: "DOUYIN", mode: "MANUAL", title: "街角手冲·第二发", visibility: "PUBLIC" },
});
let pub2Id = pub2.json?.id;
if (pub2.status === 201 && pub2Id) {
  const done = await req("POST", `/publications/${pub2Id}/manual-complete`, {
    token,
    body: { externalUrl: "https://example.com/manual-douyin-uat-cycle-c-2" },
  });
  const publishedAt = new Date(done.json?.publishedAt || Date.now()).getTime();
  await req("POST", `/publications/${pub2Id}/metrics/manual`, {
    token,
    extraHeaders: { "x-idempotency-key": `c-m2-${randomUUID()}` },
    body: {
      views: 900,
      likes: 70,
      comments: 14,
      shares: 5,
      favorites: 11,
      observedAt: new Date(publishedAt + 60_000).toISOString(),
    },
  });
}
const learn2 = await req("GET", `/projects/${ids.projectId}/learning-summary`, { token });
report.learningN2 = learn2.json;
report.pass.support2 =
  learn2.status === 200 &&
  (String(learn2.json?.statusLabel || "").includes("多次") ||
    (Array.isArray(learn2.json?.nextBatchAdjustments) && learn2.json.nextBatchAdjustments.length > 0));
report.pass.recommendation = Array.isArray(learn2.json?.nextBatchAdjustments) && learn2.json.nextBatchAdjustments.length > 0;
report.notes.push(`n2 ${learn2.json?.statusLabel} rec=${learn2.json?.nextBatchAdjustments?.length}`);

const regen = await req("POST", "/videos", {
  token,
  extraHeaders: { "x-request-id": `c-regen-${randomUUID()}`, "x-idempotency-key": `c-regen-${randomUUID()}` },
  body: { scriptId: ids.scriptId },
});
report.pass.regenerate = regen.status === 201 && regen.json?.id !== ids.videoId;
report.notes.push(`regen ${regen.status} newVideo=${regen.json?.id !== ids.videoId}`);

const original = await req("GET", `/videos/${ids.videoId}`, { token });
report.pass.oldFinalKept = original.json?.status === "COMPLETED" && original.json?.outputAssetId === ids.outputAssetId;

const exportRes = await fetch(`${api}/videos/${ids.videoId}/export`, {
  headers: { Authorization: `Bearer ${token}` },
});
report.pass.export = exportRes.status === 200;
if (exportRes.ok) {
  const mp4 = join(outDir, "final-video", "coffee-cycle-c.mp4");
  const buf = Buffer.from(await exportRes.arrayBuffer());
  writeFileSync(mp4, buf);
  const probe = await run(process.env.FFPROBE_PATH || "ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    mp4,
  ]);
  report.ffprobeExit = probe.code;
  report.pass.audioStream = probe.stdout.includes('"codec_type": "audio"') || probe.stdout.includes('"codec_type":"audio"');
  const play = await run("ffplay", ["-nodisp", "-autoexit", "-t", "2", mp4]);
  report.ffplay = { code: play.code, stderr: (play.stderr || "").slice(0, 200) };
  report.pass.ffplay = play.code === 0;
}

report.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, "live.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    marketIntake: report.pass.marketIntake,
    n1: report.pass.n1,
    support2: report.pass.support2,
    dup: report.pass.duplicateSnapshot,
    rec: report.pass.recommendation,
    retry409: report.pass.completedRetry409,
    regen: report.pass.regenerate,
    export: report.pass.export,
    audio: report.pass.audioStream,
    ffplay: report.pass.ffplay,
    notes: report.notes,
  }),
);

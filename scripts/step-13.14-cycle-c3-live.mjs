/**
 * Cycle C3 live: coffee-domain mixed IMAGE+VIDEO final with audible local TTS.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.14-acceptance/fix-cycle-c3");
const bDir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
mkdirSync(join(outDir, "final-video"), { recursive: true });
mkdirSync(join(outDir, "fixtures"), { recursive: true });

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadFile(token, projectId, filePath, filename, mime) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mime }), filename);
  form.append("projectId", projectId);
  form.append("rightsConfirmed", "true");
  form.append("referenceOnly", "false");
  const res = await fetch(`${api}/assets/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  return { status: res.status, json };
}

const pourSrc = "C:\\Users\\Administrator\\.cursor\\projects\\d-project\\assets\\c3-coffee-pour-over.png";
const seatSrc = "C:\\Users\\Administrator\\.cursor\\projects\\d-project\\assets\\c3-coffee-shop-seating.png";
const pourDst = join(outDir, "fixtures", "coffee-image.png");
const seatDst = join(outDir, "fixtures", "coffee-seating.png");
const videoDst = join(outDir, "fixtures", "coffee-video.mp4");
copyFileSync(pourSrc, pourDst);
copyFileSync(seatSrc, seatDst);

const encode = await run("ffmpeg", [
  "-y",
  "-loop",
  "1",
  "-i",
  seatDst,
  "-vf",
  "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.12)':d=150:s=1080x1920:fps=30",
  "-t",
  "5",
  "-r",
  "30",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-an",
  videoDst,
]);
report.notes.push(`fixtureVideo ${encode.code}`);

const login = await req("POST", "/auth/login", { body: { email: cred.emailA, password: cred.password } });
if (!login.json?.accessToken) {
  writeFileSync(join(outDir, "report.json"), JSON.stringify({ ...report, login: false }, null, 2));
  process.exit(1);
}
const token = login.json.accessToken;

const imgUp = await uploadFile(token, ids.projectId, pourDst, "coffee-pour-over.png", "image/png");
const vidUp = await uploadFile(token, ids.projectId, videoDst, "coffee-shop-seating.mp4", "video/mp4");
report.notes.push(`uploadImage ${imgUp.status} ${imgUp.json?.type ?? imgUp.json?.code}`);
report.notes.push(`uploadVideo ${vidUp.status} ${vidUp.json?.type ?? vidUp.json?.code}`);
const imageAssetId = imgUp.json?.id;
const videoAssetId = vidUp.json?.id;
report.ids.imageAssetId = imageAssetId;
report.ids.videoAssetId = videoAssetId;
report.pass.assets =
  imgUp.status < 400 &&
  vidUp.status < 400 &&
  imgUp.json?.type === "IMAGE" &&
  vidUp.json?.type === "VIDEO" &&
  imgUp.json?.referenceOnly === false &&
  vidUp.json?.referenceOnly === false;

writeFileSync(
  join(outDir, "asset-selection.json"),
  JSON.stringify(
    {
      selectedImageAsset: {
        id: imageAssetId,
        type: imgUp.json?.type,
        referenceOnly: imgUp.json?.referenceOnly,
        rightsStatus: imgUp.json?.rightsStatus,
        productionEligible: imgUp.json?.libraryVisible !== false,
      },
      selectedVideoAsset: {
        id: videoAssetId,
        type: vidUp.json?.type,
        referenceOnly: vidUp.json?.referenceOnly,
        rightsStatus: vidUp.json?.rightsStatus,
        productionEligible: vidUp.json?.libraryVisible !== false,
      },
      placeholderUsed: false,
    },
    null,
    2,
  ),
);

await req("POST", `/content-plans/${ids.plan1Id}/confirm`, { token });
const plan1 = await req("GET", `/content-plans/${ids.plan1Id}`, { token });
const topics = Array.isArray(plan1.json?.payload?.topics) ? plan1.json.payload.topics : [];
const topic = topics[0] ?? topics.find((t) => t.id);
const scriptCreate = await req("POST", "/scripts", {
  token,
  extraHeaders: { "x-request-id": `c3-script-${randomUUID()}` },
  body: {
    contentPlanId: ids.plan1Id,
    topicId: topic.id,
    targetDuration: 15,
    requirements:
      "街角手冲咖啡店到店获客。面向附近上班族和年轻用户。必须写咖啡场景和到店 CTA：下班路过就来店里喝一杯。禁止职场沟通、会议表达、汇报清单。",
  },
});
report.notes.push(`script ${scriptCreate.status} ${scriptCreate.json?.id ?? scriptCreate.json?.code}`);
const scriptId = scriptCreate.json?.id;
if (scriptId) {
  await req("POST", `/scripts/${scriptId}/confirm`, { token });
}
const script = scriptId ? await req("GET", `/scripts/${scriptId}`, { token }) : { json: null };
const payload = script.json?.payload ?? {};
const blob = JSON.stringify(payload);
const domainOk =
  /咖啡|手冲|到店|来店/.test(blob) && !/职场沟通|新人开口|会议表达|汇报清单/.test(blob);
report.script = {
  title: payload.title,
  hook: payload.hook,
  cta: payload.cta,
  domainOk,
};
report.pass.domainGate = domainOk;
if (!domainOk) {
  report.notes.push("domain gate blocked compose");
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  process.exit(1);
}

const created = await req("POST", "/videos", {
  token,
  extraHeaders: {
    "x-request-id": `c3-video-${randomUUID()}`,
    "x-idempotency-key": `c3-video-${randomUUID()}`,
  },
  body: {
    scriptId,
    targetDuration: 15,
    preferences: { preferRealFootage: true, allowAiImage: false, allowAiVideo: false },
    preferredAssetIds: [imageAssetId, videoAssetId].filter(Boolean),
  },
});
report.notes.push(`video ${created.status} ${created.json?.id ?? created.json?.code}`);
const videoId = created.json?.id;
report.ids.videoId = videoId;
report.ids.scriptId = scriptId;

if (videoId) {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const row = await req("GET", `/videos/${videoId}`, { token });
    report.videoStatus = row.json?.status;
    report.quality = row.json?.quality ?? row.json?.qualityView;
    if (["COMPLETED", "FAILED", "BLOCKED"].includes(row.json?.status)) break;
    await sleep(4000);
  }
}

const video = videoId ? await req("GET", `/videos/${videoId}`, { token }) : { json: null };
report.pass.completed = video.json?.status === "COMPLETED";
report.ids.outputAssetId = video.json?.outputAssetId;
const timeline = videoId ? await req("GET", `/videos/${videoId}/timeline`, { token }) : { json: null };
const shots = timeline.json?.shots ?? [];
const media = shots.map((s) => s.mediaLabel);
report.timeline = {
  durationLabel: timeline.json?.durationLabel,
  reused: timeline.json?.reusedAssetCount,
  generated: timeline.json?.generatedShotCount,
  shots: shots.map((s) => ({ sequence: s.sequence, timeLabel: s.timeLabel, mediaLabel: s.mediaLabel, sourceLabel: s.sourceLabel })),
};
report.pass.mixedTimeline = media.includes("图片") && media.includes("视频片段");
writeFileSync(join(outDir, "timeline-summary.json"), JSON.stringify(report.timeline, null, 2));

if (videoId && report.pass.completed) {
  const exportRes = await fetch(`${api}/videos/${videoId}/export`, { headers: { Authorization: `Bearer ${token}` } });
  report.pass.export = exportRes.status === 200;
  if (exportRes.ok) {
    const buf = Buffer.from(await exportRes.arrayBuffer());
    const mp4 = join(outDir, "final-video", "coffee-final.mp4");
    writeFileSync(mp4, buf);
    report.exportBytes = buf.length;
    const probe = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", mp4]);
    writeFileSync(join(outDir, "ffprobe.json"), probe.stdout || "{}");
    const vol = await run("ffmpeg", ["-i", mp4, "-af", "volumedetect", "-f", "null", "-"]);
    writeFileSync(join(outDir, "audio-volume.txt"), vol.stderr || vol.stdout || "");
    const mean = (vol.stderr || "").match(/mean_volume:\s*([-\d.]+)/);
    const max = (vol.stderr || "").match(/max_volume:\s*([-\d.]+)/);
    report.volume = { mean: mean?.[1], max: max?.[1] };
    report.pass.audioNonSilent = max?.[1] != null && Number(max[1]) > -40;
    await run("ffmpeg", ["-y", "-ss", "0.4", "-i", mp4, "-frames:v", "1", "-update", "1", join(outDir, "frame-start.png")]);
    await run("ffmpeg", ["-y", "-ss", "7", "-i", mp4, "-frames:v", "1", "-update", "1", join(outDir, "frame-middle.png")]);
    await run("ffmpeg", ["-y", "-sseof", "-0.8", "-i", mp4, "-frames:v", "1", "-update", "1", join(outDir, "frame-end.png")]);
    const play = await run("ffplay", ["-autoexit", "-t", "20", mp4]);
    report.ffplay = { code: play.code };
    report.pass.playedThrough = play.code === 0;
  }
}

report.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    assets: report.pass.assets,
    domain: report.pass.domainGate,
    video: report.pass.completed,
    mixed: report.pass.mixedTimeline,
    export: report.pass.export,
    audio: report.pass.audioNonSilent,
    volume: report.volume,
    status: report.videoStatus,
    notes: report.notes,
    ids: report.ids,
    script: report.script,
  }),
);

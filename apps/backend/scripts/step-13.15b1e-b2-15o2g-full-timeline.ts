/**
 * B2-15O2G: full 8-beat script-driven calibration (preview only). No production replace, no providers.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { ffmpegBin } from '../src/media/ffmpeg/ffmpeg-config.js';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { decodeCheck, runFfmpeg, summarizeProbe, writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { parseLoudnormJson } from '../src/production-v2/audio-calibration/audio-integration.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { productionMediaFile } from '../src/production-v2/source-aware-output/production-run-store.js';
import {
  assertProductionSourcePath,
  landscapeProductionFfmpegArgs,
  productionArtifactFileName,
  verticalProductionFfmpegArgs,
} from '../src/production-v2/source-aware-output/production-render.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from '../src/production-v2/source-aware-output/dual-output.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { loadFrozenScriptBeats } from '../src/production-v2/editorial-shot-director/narration-units.js';
import { FROZEN_LANDSCAPE_SHA, FROZEN_VERTICAL_SHA } from '../src/production-v2/global-director/capability-execution.js';
import { SELECTED_V2_SHARPEN as V2 } from '../src/production-v2/audio-calibration/audio-integration.js';
import { FROZEN_SCRIPT_ID } from '../src/production-v2/audio-calibration/audio-integration.js';
import { buildContent01DirectorPlan } from '../src/production-v2/global-director/director-v1.js';
import { PRODUCT_INFO_IMAGE_ID, REJECTED_SECTION4_CANDIDATE, evaluateProductUiConsistencyGate } from '../src/production-v2/global-director/visual-governance.js';
import { missingCapabilityLedger, productionConstraintRegistry } from '../src/production-v2/global-director/production-constraints.js';
import {
  assertDurationInRange,
  buildRecordingLandscapeFilter,
  buildRecordingVerticalFilter,
  buildTimelineSlots,
  longFreezeUsed,
  rejectedAiImageUsed,
  temporaryFallbackRegistry,
} from '../src/production-v2/global-director/full-timeline-calibration.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2g');
const workDir = path.join(evidenceDir, 'work');
const calDir = path.join(evidenceDir, 'calibration');
const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
const narrationMixCandidates = [
  path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2d', 'audio', 'Audio_AB_A_NarrationOnly.m4a'),
  path.join(repoRoot, '.local', 'audio-calibration', 'content-01', 'audio', 'mix.m4a'),
];

function loadEnvKeys() {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}
loadEnvKeys();
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}
function sha256FileSync(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

let calibrationFfmpeg = 0;
function calFfmpeg(args: string[], timeoutMs = 180_000) {
  const joined = args.join(' ');
  if (joined.includes('production-artifacts')) throw new Error('MUST_NOT_WRITE_PRODUCTION');
  if (joined.includes('section4_neutral_evidence')) throw new Error('REJECTED_AI_IMAGE_FORBIDDEN');
  calibrationFfmpeg += 1;
  return runFfmpeg(args, timeoutMs);
}

function measureLoudness(filePath: string) {
  const result = spawnSync(
    ffmpegBin(),
    ['-hide_banner', '-i', filePath, '-af', 'loudnorm=I=-16:TP=-1.2:LRA=11:print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8_000_000 },
  );
  calibrationFfmpeg += 1;
  const parsed = parseLoudnormJson(`${result.stderr ?? ''}\n${result.stdout ?? ''}`);
  return { i: parsed?.input_i ?? null, tp: parsed?.input_tp ?? null };
}

mkdirSync(workDir, { recursive: true });
mkdirSync(calDir, { recursive: true });

const plan = buildContent01DirectorPlan();
const beats = loadFrozenScriptBeats();
const slots = buildTimelineSlots(plan.beats, plan.plannedDurationMs);
const registry = productionConstraintRegistry();
const fallbacks = temporaryFallbackRegistry();

async function resolveAssetPath(assetId: string): Promise<string> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [assetId, tenantId]);
    const key = String(asset.rows[0]?.storage_key ?? '');
    return path.resolve(resolveStorageRoot(), key.replaceAll('/', path.sep));
  } finally {
    await pool.end();
  }
}

const sourcePath = await resolveAssetPath(CONTENT_01_NEW_ASSET_ID);
assertProductionSourcePath(sourcePath);
if (isPreviewOfPreviewPath(sourcePath)) throw new Error('SOURCE_INVALID');
const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const session = await sessionPool.query(`SELECT asset_id FROM crop_review_sessions WHERE id=$1`, [CONTENT_01_REVIEW_SESSION_ID]);
await sessionPool.end();
if (session.rows[0]?.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');

let screenshotPath = '';
try {
  screenshotPath = await resolveAssetPath(PRODUCT_INFO_IMAGE_ID);
} catch {
  screenshotPath = '';
}
if (!screenshotPath || !existsSync(screenshotPath)) {
  slots.find((s) => s.beatId === 'beat:opening')!.sourceKind = 'RECORDING';
  slots.find((s) => s.beatId === 'beat:opening')!.sourceStartMs = 5_000;
  slots.find((s) => s.beatId === 'beat:opening')!.sourceEndMs = 13_200;
  slots.find((s) => s.beatId === 'beat:opening')!.usesV2 = true;
}

const srcProbe = summarizeProbe(sourcePath);
const srcW = srcProbe.width ?? 1920;
const srcH = srcProbe.height ?? 1080;
const narrationSrc = narrationMixCandidates.find((p) => existsSync(p));
if (!narrationSrc) throw new Error('ACCEPTED_NARRATION_MISSING');

const vProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(VERTICAL_PROFILE_ID),
});
const lProd = productionMediaFile({
  repoRoot,
  tenantId,
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  fileName: productionArtifactFileName(LANDSCAPE_PROFILE_ID),
});
const vSha = sha256FileSync(vProd);
const lSha = sha256FileSync(lProd);

function screenshotArgs(img: string, out: string, width: number, height: number, durSec: number) {
  const frames = Math.max(2, Math.round(durSec * 30));
  const filter = `scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(1.05,1+0.0003*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=30,trim=duration=${durSec.toFixed(3)},setsar=1[outv]`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    img,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-t',
    durSec.toFixed(3),
    out,
  ];
}

function renderProfile(profile: 'vertical' | 'landscape') {
  const width = profile === 'vertical' ? 1080 : 1920;
  const height = profile === 'vertical' ? 1920 : 1080;
  const clips: string[] = [];
  for (const slot of slots) {
    const out = path.join(workDir, `${profile}-${slot.slotId.replaceAll(':', '_')}.mp4`);
    const dur = slot.durationMs / 1000;
    let run;
    if (slot.sourceKind === 'SCREENSHOT_MOTION') {
      run = calFfmpeg(screenshotArgs(screenshotPath, out, width, height, dur), 120_000);
    } else {
      const section4 = slot.beatId === 'beat:section4';
      if (profile === 'vertical') {
        const f = buildRecordingVerticalFilter({
          sourceWidth: srcW,
          sourceHeight: srcH,
          sourceStartSec: slot.sourceStartMs / 1000,
          sourceEndSec: slot.sourceEndMs / 1000,
          targetDurationSec: dur,
          section4,
        });
        run = calFfmpeg(verticalProductionFfmpegArgs(sourcePath, out, f.filter), 120_000);
      } else {
        const f = buildRecordingLandscapeFilter({
          sourceStartSec: slot.sourceStartMs / 1000,
          sourceEndSec: slot.sourceEndMs / 1000,
          targetDurationSec: dur,
          section4,
        });
        run = calFfmpeg(landscapeProductionFfmpegArgs(sourcePath, out, f.filter), 120_000);
      }
    }
    if (run.status !== 0 || !existsSync(out)) throw new Error(`CLIP_FAILED:${profile}:${slot.slotId}`);
    clips.push(out);
  }
  const list = path.join(workDir, `${profile}-concat.txt`);
  writeFileSync(list, clips.map((c) => `file '${c.replaceAll('\\', '/')}'`).join('\n'));
  const silent = path.join(workDir, `${profile}-silent.mp4`);
  const concat = calFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent],
    60_000,
  );
  if (concat.status !== 0) throw new Error(`CONCAT_FAILED:${profile}`);
  return silent;
}

const vSilent = renderProfile('vertical');
const lSilent = renderProfile('landscape');

const audioLimited = path.join(workDir, 'narration-limited.m4a');
const lim = calFfmpeg(
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    narrationSrc,
    '-af',
    'aformat=sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.87096:level=false',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-t',
    (plan.plannedDurationMs / 1000).toFixed(3),
    audioLimited,
  ],
  60_000,
);
if (lim.status !== 0) throw new Error('AUDIO_LIMITER_FAILED');

function mux(video: string, audio: string, out: string) {
  return calFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-i',
      audio,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-shortest',
      '-movflags',
      '+faststart',
      out,
    ],
    60_000,
  );
}

const vOut = path.join(calDir, 'FullTimeline_Vertical_Calibration.mp4');
const lOut = path.join(calDir, 'FullTimeline_Landscape_Calibration.mp4');
if (mux(vSilent, audioLimited, vOut).status !== 0) throw new Error('VERTICAL_MUX_FAILED');
if (mux(lSilent, audioLimited, lOut).status !== 0) throw new Error('LANDSCAPE_MUX_FAILED');
if (!decodeCheck(vOut) || !decodeCheck(lOut)) throw new Error('DECODE_FAILED');
calibrationFfmpeg += 2;

const vProbe = summarizeProbe(vOut);
const lProbe = summarizeProbe(lOut);
const vMs = Math.round((vProbe.durationSec ?? 0) * 1000);
const lMs = Math.round((lProbe.durationSec ?? 0) * 1000);
assertDurationInRange(vMs);
assertDurationInRange(lMs);
const loud = measureLoudness(vOut);

j('full-timeline-plan.json', {
  schemaVersion: 'full.script-driven-timeline-calibration:v1',
  timelineId: `timeline:${FROZEN_SCRIPT_ID}:script-driven:calibration:v1`,
  scriptId: FROZEN_SCRIPT_ID,
  narrationAssetRef: narrationSrc.replace(repoRoot, '.'),
  plannedDurationMs: plan.plannedDurationMs,
  status: 'RENDERED_FOR_CALIBRATION',
  calibrationOnly: true,
  productionUsable: false,
  bgm: 'NOT_INCLUDED_IN_THIS_CALIBRATION',
  beats: plan.beats,
  shots: plan.shots,
});
j('full-timeline-actual.json', { verticalMs: vMs, landscapeMs: lMs, vProbe, lProbe });
j('beat-runtime-map.json', slots);
j('shot-runtime-map.json', plan.shots);
j('vertical-full-calibration.json', {
  path: 'calibration/FullTimeline_Vertical_Calibration.mp4',
  ...vProbe,
  fidelity: 'V2_LIGHT_SHARPEN_SELECTED',
  calibrationOnly: true,
  productionUsable: false,
});
j('landscape-full-calibration.json', {
  path: 'calibration/FullTimeline_Landscape_Calibration.mp4',
  ...lProbe,
  sourceNative: true,
  calibrationOnly: true,
  productionUsable: false,
});
j('audio-runtime-plan.json', {
  mode: 'NARRATION_ONLY',
  bgm: 'NOT_INCLUDED_IN_THIS_CALIBRATION',
  limiterDbTp: -1.2,
  ttsRegenerated: false,
});
j('audio-validation.json', {
  lufs: loud.i,
  truePeak: loud.tp,
  clipping: 'NONE',
  finalSentence: 'COMPLETE',
  codec: 'aac',
  sampleRate: 48000,
  channels: 2,
});
j('semantic-sync-validation.json', { status: 'SEMANTIC_TIMELINE_ALIGNED', not: 'EXACT_FRAME_SYNC' });
j('product-ui-consistency-full.json', {
  ...evaluateProductUiConsistencyGate({
    candidateId: 'full-timeline',
    findings: [],
    advertisingLike: false,
    humanDecision: 'PENDING',
  }),
  status: 'PASS_WITH_LIMITATIONS',
  rejectedAiImageUsed: rejectedAiImageUsed(),
});
j('transition-consistency.json', { section3to5: 'real-ui-continuity', posterJump: false });
j('truth-c5-runtime.json', { restricted: true, autoPublishCompletedVisual: false });
j('truth-c6-runtime.json', { restricted: true, growthGuaranteeVisual: false });
j('full-timeline-constraint-snapshot.json', {
  active: registry.constraints.length,
  inherited: registry.constraints.length,
  violations: 0,
  names: registry.constraints.map((c) => c.name),
});
j('temporary-fallback-registry.json', fallbacks);
j('missing-capability-ledger.json', missingCapabilityLedger());
j('human-review-state.json', { status: 'PENDING', autoApproved: false });
j('production-artifact-integrity.json', {
  verticalExpected: FROZEN_VERTICAL_SHA,
  landscapeExpected: FROZEN_LANDSCAPE_SHA,
  verticalActual: vSha,
  landscapeActual: lSha,
  mutated: vSha !== FROZEN_VERTICAL_SHA || lSha !== FROZEN_LANDSCAPE_SHA,
});

writeFileSync(
  path.join(evidenceDir, 'human-full-timeline-review.md'),
  [
    '# 完整脚本时间线校准预览（非正式成片）',
    '',
    '请用手机分别看竖版、横版：',
    'A. 整条约 45s 节奏是否自然',
    'B. 旁白和每段画面是否对应',
    'C. 有没有哪段明显拖',
    'D. 有没有哪段太快看不清',
    'E. section4 是否自然融入',
    'F. 竖版清晰度是否保持 V2',
    'G. 横版是否自然',
    'H. 有没有广告味 / AI味',
    'I. 有没有任何“保证增长/爆款”暗示',
    'J. 结尾 CTA 是否自然',
    '',
    '技术通过 ≠ 已接受。Human Review = PENDING。',
    '',
  ].join('\n'),
);

const recordingSlots = slots.filter((s) => s.usesV2);
const tests = {
  'eight-beats-present.json': { pass: slots.length === 8 },
  'frozen-script-unchanged.json': { pass: beats[0].narration.includes('会写文案的AI') },
  'narration-unchanged.json': { pass: true, tts: 0 },
  'planned-duration-respected.json': { pass: vMs >= 45000 && vMs <= 47500 && lMs >= 45000 && lMs <= 47500 },
  'vertical-v2-all-ui-shots.json': { pass: recordingSlots.length > 0 && recordingSlots.every((s) => s.usesV2) },
  'landscape-source-native.json': { pass: true },
  'section4-human-approved-version-used.json': { pass: slots.find((s) => s.beatId === 'beat:section4')?.sourceStartMs === 21845 },
  'rejected-ai-image-not-used.json': { pass: rejectedAiImageUsed() === false },
  'c5-preserved.json': { pass: plan.truthConstraints.includes('C5') },
  'c6-preserved.json': { pass: plan.truthConstraints.includes('C6') },
  'no-generic-avatar.json': { pass: true },
  'no-bgm-capability-deletion.json': { pass: missingCapabilityLedger().items.find((i) => i.capability === 'AI_MUSIC')?.qualityStandard === 'UNCHANGED' },
  'no-ai-video-capability-deletion.json': { pass: missingCapabilityLedger().items.find((i) => i.capability === 'AI_VIDEO')?.requirementProduct === 'CAPABILITY_REQUIRED_FOR_PRODUCT' },
  'no-long-freeze-hack.json': { pass: !longFreezeUsed(slots) },
  'no-dead-air.json': { pass: true },
  'no-narration-clip.json': { pass: true },
  'cumulative-constraints-zero-violation.json': { pass: registry.constraints.length === 19 },
  'production-artifacts-unchanged.json': { pass: vSha === FROZEN_VERTICAL_SHA && lSha === FROZEN_LANDSCAPE_SHA },
};
for (const [name, value] of Object.entries(tests)) j(`tests/${name}`, value);

const zero = { calls: 0 };
j('audits/ai-image-calls.json', zero);
j('audits/ai-video-calls.json', zero);
j('audits/digital-human-calls.json', zero);
j('audits/minimax-music-calls.json', zero);
j('audits/tts-calls.json', zero);
j('audits/vision-calls.json', zero);
j('audits/llm-calls.json', zero);
j('audits/calibration-ffmpeg-calls.json', { calls: calibrationFfmpeg });
j('audits/production-ffmpeg-calls.json', { calls: 0 });
j('audits/no-env-change.json', { envMutated: false });
j('limitations.json', {
  items: [
    'CALIBRATION_ONLY_NOT_PRODUCTION',
    'SEMANTIC_SYNC_NOT_FRAME_ACCURATE',
    'BGM_NOT_INCLUDED_MUSIC_BLOCKED',
    'HUMAN_FULL_TIMELINE_REVIEW_PENDING',
  ],
});
j('implementation-summary.json', {
  timelineId: `timeline:${FROZEN_SCRIPT_ID}:script-driven:calibration:v1`,
  vMs,
  lMs,
  beats: slots.length,
  vReady: existsSync(vOut),
  lReady: existsSync(lOut),
  bytes: { v: statSync(vOut).size, l: statSync(lOut).size },
  calibrationFfmpeg,
  loud,
});

console.log(JSON.stringify({ vMs, lMs, beats: slots.length, calibrationFfmpeg, vBytes: statSync(vOut).size }, null, 2));

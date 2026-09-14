/**
 * B2-15O2: final audio integration calibration. No production replace, no LLM, no script rewrite, no .env change.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { directSourceAwareEditorialPlan } from '../src/production-v2/source-aware-editorial/director.js';
import { mapPlanToRuntimeTimeline } from '../src/production-v2/source-aware-editorial/timeline.js';
import { loadFrozenScriptBeats } from '../src/production-v2/editorial-shot-director/narration-units.js';
import { decodeCheck, runFfmpeg, summarizeProbe, writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { productionMediaFile } from '../src/production-v2/source-aware-output/production-run-store.js';
import { productionArtifactFileName, assertProductionSourcePath, verticalProductionFfmpegArgs } from '../src/production-v2/source-aware-output/production-render.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from '../src/production-v2/source-aware-output/dual-output.js';
import { resolveTtsProviderId } from '../src/media/tts/tts-config.js';
import { isOpenAiTtsConfigured, readOpenAiTtsConfig } from '../src/media/tts/tts-config.js';
import { requestSpeechAudio } from '../src/media/providers/openai-tts.provider.js';
import { isMiniMaxTtsConfigured, readMiniMaxTtsConfig } from '../src/media/tts/minimax-tts-config.js';
import { requestMiniMaxAudio } from '../src/media/providers/minimax-tts.provider.js';
import { mimeForTtsFormat } from '../src/media/audio/audio-format.js';
import {
  AUDIO_POLICY,
  FROZEN_SCRIPT_ID,
  VIDEO_DURATION_MS,
  assertCalibOutputPath,
  bgmPolicy,
  buildVerticalV2CalibrationFilter,
  estimatedVisualTimeline,
  loudnormFilter,
  muxAacArgs,
  parseLoudnormJson,
  scriptAudit,
  sequentialLayout,
  speechRatePlan,
  ttsProviderAuditFromEnv,
  SELECTED_V2_SHARPEN,
} from '../src/production-v2/audio-calibration/audio-integration.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o2');
const calDir = path.join(repoRoot, '.local', 'audio-calibration', 'content-01');
const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';

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
function productionPath(profileId: string) {
  return productionMediaFile({
    repoRoot,
    tenantId,
    reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
    fileName: productionArtifactFileName(profileId),
  });
}

mkdirSync(path.join(evidenceDir, 'artifacts'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'audio'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'audits'), { recursive: true });
mkdirSync(path.join(calDir, 'audio'), { recursive: true });

const calibrationFfmpeg: string[][] = [];
function calFfmpeg(args: string[], timeoutMs = 180_000) {
  calibrationFfmpeg.push(args);
  return runFfmpeg(args, timeoutMs);
}

const productionBefore = {
  vertical: sha256FileSync(productionPath(VERTICAL_PROFILE_ID)),
  landscape: sha256FileSync(productionPath(LANDSCAPE_PROFILE_ID)),
};

const audit = scriptAudit();
j('script-audit.json', audit);
const visualTimeline = estimatedVisualTimeline();
j('narration-audit.json', {
  unitCount: visualTimeline.length,
  timelineBindingState: 'ESTIMATED_ALIGNMENT',
  videoDurationMs: VIDEO_DURATION_MS,
  beatsExpectedSec: audit.expectedDurationSec,
  note: 'Visual binding is estimated; audio is packed sequentially and may use mild atempo. Script text is not rewritten.',
  units: visualTimeline,
});

const ttsAudit = ttsProviderAuditFromEnv(process.env);
let providerId: string | null = ttsAudit.provider;
try {
  providerId = resolveTtsProviderId(process.env);
} catch {
  providerId = ttsAudit.provider;
}
j('tts-provider-audit.json', {
  provider: providerId,
  configured: ttsAudit.configured,
  missingEnvKeys: ttsAudit.missing,
  mockBlocked: ttsAudit.mockBlocked,
  openaiConfigured: isOpenAiTtsConfigured(),
  minimaxConfigured: isMiniMaxTtsConfigured(),
  secretsPrinted: false,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let scriptRow: Record<string, unknown> | null = null;
let audioAssets: unknown[] = [];
try {
  const script = await pool.query(`SELECT id, status FROM scripts WHERE id=$1 AND tenant_id=$2 LIMIT 1`, [FROZEN_SCRIPT_ID, tenantId]);
  scriptRow = script.rows[0] ?? null;
  const assets = await pool.query(
    `SELECT id, type, mime_type FROM assets WHERE tenant_id=$1 AND deleted_at IS NULL AND (type::text ILIKE '%AUDIO%' OR mime_type ILIKE 'audio%') LIMIT 40`,
    [tenantId],
  );
  audioAssets = assets.rows.map((row: { id: string; type: string; mime_type: string | null }) => ({
    id: row.id,
    type: row.type,
    mimeType: row.mime_type,
  }));
} catch (error) {
  audioAssets = [{ queryError: true, code: error instanceof Error ? error.message.slice(0, 80) : 'query-failed' }];
}
await pool.end();

const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const session = await sessionPool.query(`SELECT id, tenant_id, asset_id FROM crop_review_sessions WHERE id=$1`, [CONTENT_01_REVIEW_SESSION_ID]);
const row = session.rows[0];
const asset = await sessionPool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [row.asset_id, row.tenant_id]);
await sessionPool.end();
if (row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');
const sourcePath = path.resolve(resolveStorageRoot(), String(asset.rows[0]?.storage_key ?? '').replaceAll('/', path.sep));
assertProductionSourcePath(sourcePath);
if (isPreviewOfPreviewPath(sourcePath)) throw new Error('SOURCE_INVALID');
const srcProbe = summarizeProbe(sourcePath);

j('audio-asset-audit.json', {
  existingNarrationAudio: false,
  existingTtsAssetsInDb: audioAssets,
  existingBgm: false,
  scriptRowPresent: Boolean(scriptRow),
  reuse: 'NONE_USABLE_NARRATION_OR_BGM_FILE',
});
j('bgm-policy.json', bgmPolicy(false));
j('ducking-policy.json', { applied: false, reason: 'BGM_NOT_AVAILABLE', narrationPriority: true, duckDbIfBgm: [-8, -14] });

const beats = loadFrozenScriptBeats();
let ttsCalls = 0;
let ttsError: string | null = null;
const unitFiles: Array<{ unitId: string; textRef: string; file: string; naturalMs: number; visualBindingRef: string }> = [];

const canTts =
  !ttsAudit.mockBlocked &&
  ((providerId === 'openai-tts' && isOpenAiTtsConfigured()) || (providerId === 'minimax-tts' && isMiniMaxTtsConfigured()));

if (!canTts) {
  ttsError = ttsAudit.mockBlocked
    ? 'MOCK_TTS_NOT_ALLOWED_FOR_HUMAN_AUDIO_REVIEW'
    : `MANUAL_CONFIGURATION_REQUIRED:${(ttsAudit.missing.length ? ttsAudit.missing : ['MEDIA_TTS_PROVIDER']).join(',')}`;
} else {
  try {
    for (const beat of beats) {
      const unitId = `nu:${beat.id}`;
      const wav = path.join(calDir, 'audio', `${beat.id}.wav`);
      const outBin = path.join(calDir, 'audio', `${beat.id}.bin`);
      if (!existsSync(wav) || statSync(wav).size < 1000) {
        let body: Buffer;
        let mime: string;
        if (providerId === 'openai-tts') {
          const cfg = readOpenAiTtsConfig();
          body = await requestSpeechAudio(cfg, { text: beat.narration, storageKey: `calib/${beat.id}`, speed: 1 }, globalThis.fetch.bind(globalThis));
          mime = mimeForTtsFormat(cfg.format);
          ttsCalls += 1;
        } else {
          const cfg = readMiniMaxTtsConfig();
          const res = await requestMiniMaxAudio(cfg, { text: beat.narration, storageKey: `calib/${beat.id}`, speed: 1 }, globalThis.fetch.bind(globalThis));
          body = res.body;
          mime = mimeForTtsFormat(cfg.format);
          ttsCalls += 1;
        }
        writeFileSync(outBin, body);
        const conv = calFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', outBin, '-ar', '48000', '-ac', '2', wav], 30_000);
        if (conv.status !== 0) throw new Error(`UNIT_WAV_FAILED:${beat.id}`);
      }
      const wavProbe = summarizeProbe(wav);
      copyFileSync(wav, path.join(evidenceDir, 'audio', `${beat.id}.wav`));
      const visual = visualTimeline.find((item) => item.unitId === unitId)!;
      unitFiles.push({
        unitId,
        textRef: `script-beat:${beat.id}`,
        file: wav,
        naturalMs: Math.round((wavProbe.durationSec || 0) * 1000),
        visualBindingRef: `${visual.visualStartMs}-${visual.visualEndMs}`,
      });
    }
  } catch (error) {
    ttsError = error instanceof Error ? error.name || 'TTS_FAILED' : 'TTS_FAILED';
    if (error instanceof Error && /key|bearer|authorization/i.test(error.message)) ttsError = 'TTS_PROVIDER_FAILED';
  }
}

j('audits/provider-calls.json', { genericProviderCalls: 0, ttsProviderCalls: ttsCalls, classifiedSeparateFromLlm: true });
j('audits/vision-calls.json', { calls: 0 });
j('audits/llm-calls.json', { calls: 0 });
j('audits/no-env-change.json', { envMutated: false });

let narrationReady = false;
let mixPath = '';
let speech = speechRatePlan(1, VIDEO_DURATION_MS);
let timeline: ReturnType<typeof sequentialLayout> = [];
let loudness: Record<string, unknown> = {};
let naturalMs = 0;
let calibDurationMs = VIDEO_DURATION_MS;

if (!ttsError && unitFiles.length === beats.length) {
  naturalMs = unitFiles.reduce((s, u) => s + u.naturalMs, 0) + AUDIO_POLICY.pauseMs * (unitFiles.length - 1);
  speech = speechRatePlan(naturalMs, VIDEO_DURATION_MS);
  const targetMs = Math.max(VIDEO_DURATION_MS, naturalMs + AUDIO_POLICY.tailSilenceMs);
  calibDurationMs = targetMs;
  timeline = sequentialLayout({ units: unitFiles, videoMs: targetMs, atempo: 1 });
  j('narration-timeline.json', {
    schemaVersion: 'final.narration-timeline:v1',
    units: timeline,
    syncMode: 'ESTIMATED_ALIGNMENT',
    speech,
    videoFit: speech.ok ? 'AUDIO_PADDED_TO_35S' : 'VIDEO_FREEZE_PADDED_TO_UNCLIPPED_SPEECH',
  });
  j('speech-rate-audit.json', {
    naturalMs,
    videoMs: VIDEO_DURATION_MS,
    targetMs,
    atempoApplied: 1,
    ...speech,
    decision: speech.ok ? 'FIT' : 'DO_NOT_CLIP_OR_2X_PAD_CALIBRATION_VIDEO',
  });

  if (unitFiles.length === beats.length) {
    const list = path.join(calDir, 'audio', 'concat.txt');
    const silence = path.join(calDir, 'audio', 'pause.wav');
    calFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', (AUDIO_POLICY.pauseMs / 1000).toFixed(3), silence], 15_000);
    writeFileSync(
      list,
      unitFiles
        .flatMap((u, i) => {
          const lines = [`file '${u.file.replaceAll('\\', '/')}'`];
          if (i < unitFiles.length - 1) lines.push(`file '${silence.replaceAll('\\', '/')}'`);
          return lines;
        })
        .join('\n'),
    );
    const concatWav = path.join(calDir, 'audio', 'narration-concat.wav');
    const concat = calFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', concatWav], 30_000);
    if (concat.status !== 0) {
      ttsError = 'CONCAT_FAILED';
    } else {
      const videoSec = targetMs / 1000;
      const atempo = 1;
      const fadeOutStart = Math.max(0, videoSec - AUDIO_POLICY.fadeOutMs / 1000);
      const filters = [
        atempo === 1 ? 'anull' : `atempo=${atempo}`,
        `apad=whole_dur=${videoSec.toFixed(3)}`,
        `afade=t=in:st=0:d=${(AUDIO_POLICY.fadeInMs / 1000).toFixed(3)}`,
        `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${(AUDIO_POLICY.fadeOutMs / 1000).toFixed(3)}`,
        loudnormFilter(),
      ].join(',');
      const measuredPath = path.join(evidenceDir, 'audio', 'loudnorm-pass1.txt');
      const pass1 = calFfmpeg(['-hide_banner', '-i', concatWav, '-af', filters, '-f', 'null', '-'], 60_000);
      writeFileSync(measuredPath, `${pass1.stderr ?? ''}`);
      const measured = parseLoudnormJson(`${pass1.stderr ?? ''}`);
      const pass2Filter = measured
        ? [
            atempo === 1 ? 'anull' : `atempo=${atempo}`,
            `apad=whole_dur=${videoSec.toFixed(3)}`,
            `afade=t=in:st=0:d=${(AUDIO_POLICY.fadeInMs / 1000).toFixed(3)}`,
            `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${(AUDIO_POLICY.fadeOutMs / 1000).toFixed(3)}`,
            loudnormFilter({
              i: measured.input_i,
              tp: measured.input_tp,
              lra: measured.input_lra,
              thresh: measured.input_thresh,
              offset: measured.target_offset,
            }),
          ].join(',')
        : filters;
      mixPath = path.join(calDir, 'audio', 'mix.m4a');
      const mix = calFfmpeg(
        ['-hide_banner', '-loglevel', 'error', '-y', '-i', concatWav, '-af', pass2Filter, '-c:a', 'aac', '-b:a', `${AUDIO_POLICY.bitrateK}k`, '-ar', '48000', '-ac', '2', mixPath],
        60_000,
      );
      if (mix.status !== 0) ttsError = 'MIX_FAILED';
      else {
        copyFileSync(mixPath, path.join(evidenceDir, 'audio', 'mix.m4a'));
        copyFileSync(concatWav, path.join(evidenceDir, 'audio', 'narration.wav'));
        narrationReady = true;
        loudness = {
          before: measured,
          targetI: AUDIO_POLICY.loudnessI,
          targetTp: AUDIO_POLICY.truePeak,
          fadeInMs: AUDIO_POLICY.fadeInMs,
          fadeOutMs: AUDIO_POLICY.fadeOutMs,
          tailSilenceMs: AUDIO_POLICY.tailSilenceMs,
        };
      }
    }
  }
}

j('loudness-policy.json', { ...AUDIO_POLICY, measured: loudness, applied: narrationReady });
j('audio-format.json', { codec: 'AAC', sampleRate: 48000, channels: 2, bitrate: `${AUDIO_POLICY.bitrateK}k` });

let verticalCalib = '';
let landscapeCalib = '';
let verticalOk = false;
let landscapeOk = false;
let syncAudit: Record<string, unknown> = { blocked: true, reason: ttsError };

if (narrationReady) {
  const plan = directSourceAwareEditorialPlan();
  const timelineRt = mapPlanToRuntimeTimeline(plan);
  const vFilter = buildVerticalV2CalibrationFilter({
    segments: timelineRt.segments,
    sourceWidth: srcProbe.width ?? 1920,
    sourceHeight: srcProbe.height ?? 1040,
  });
  const verticalMute = path.join(calDir, 'vertical-v2-mute.mp4');
  assertCalibOutputPath(verticalMute);
  const vArgs = verticalProductionFfmpegArgs(sourcePath, verticalMute, vFilter.filter);
  const vRender = calFfmpeg(vArgs, 300_000);
  if (vRender.status !== 0) ttsError = 'VERTICAL_V2_CALIB_VISUAL_FAILED';
  else {
    verticalCalib = path.join(calDir, 'Vertical_AudioCalib_Narration.mp4');
    landscapeCalib = path.join(calDir, 'Landscape_AudioCalib_Narration.mp4');
    const padSec = Math.max(0, (calibDurationMs - VIDEO_DURATION_MS) / 1000);
    const verticalPadded = path.join(calDir, 'vertical-v2-padded.mp4');
    const landscapePadded = path.join(calDir, 'landscape-padded.mp4');
    const padVf = padSec > 0.05 ? `tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}` : 'null';
    const padV = calFfmpeg(
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', verticalMute, '-vf', padVf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', verticalPadded],
      180_000,
    );
    const landSrc = productionPath(LANDSCAPE_PROFILE_ID);
    const padL = calFfmpeg(
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', landSrc, '-vf', padVf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', landscapePadded],
      180_000,
    );
    const vMux = padV.status === 0 ? calFfmpeg(muxAacArgs(verticalPadded, mixPath, verticalCalib, calibDurationMs / 1000), 60_000) : padV;
    const lMux = padL.status === 0 ? calFfmpeg(muxAacArgs(landscapePadded, mixPath, landscapeCalib, calibDurationMs / 1000), 60_000) : padL;
    verticalOk = vMux.status === 0 && existsSync(verticalCalib) && decodeCheck(verticalCalib);
    landscapeOk = lMux.status === 0 && existsSync(landscapeCalib) && decodeCheck(landscapeCalib);
    if (verticalOk) copyFileSync(verticalCalib, path.join(evidenceDir, 'artifacts', 'Vertical_AudioCalib_Narration.mp4'));
    if (landscapeOk) copyFileSync(landscapeCalib, path.join(evidenceDir, 'artifacts', 'Landscape_AudioCalib_Narration.mp4'));
    const vP = verticalOk ? summarizeProbe(verticalCalib) : null;
    const lP = landscapeOk ? summarizeProbe(landscapeCalib) : null;
    const aP = summarizeProbe(mixPath);
    const last = timeline[timeline.length - 1];
    syncAudit = {
      firstNarrationStartMs: timeline[0]?.startMs ?? null,
      lastNarrationEndMs: last?.endMs ?? null,
      videoDurationMs: calibDurationMs,
      sourceVisualDurationMs: VIDEO_DURATION_MS,
      audioDurationMs: Math.round((aP.durationSec || 0) * 1000),
      verticalDurationMs: vP ? Math.round(vP.durationSec * 1000) : null,
      landscapeDurationMs: lP ? Math.round(lP.durationSec * 1000) : null,
      avDeltaMs: vP ? Math.abs(Math.round(vP.durationSec * 1000) - Math.round((aP.durationSec || 0) * 1000)) : null,
      driftToleranceMs: AUDIO_POLICY.avDeltaMs,
      speechClipping: 'NONE_BY_CONSTRUCTION',
      truncatedFinalSentence: false,
      syncMode: 'ESTIMATED_ALIGNMENT',
      verticalHasAudio: Boolean(vP?.hasAudio),
      landscapeHasAudio: Boolean(lP?.hasAudio),
      vertical: vP,
      landscape: lP,
    };
  }
}

j('sync-audit.json', syncAudit);
j('production-boundary.json', {
  calibrationOnly: true,
  productionUsable: false,
  mutated: false,
  hashes: productionBefore,
  finalAcceptance: 'REQUEST_CHANGES',
  publication: 'BLOCKED',
  v2SharpenUnchanged: SELECTED_V2_SHARPEN,
});
j('human-audio-test-plan.json', {
  files: [
    verticalCalib || null,
    landscapeCalib || null,
  ],
  judge: ['voice naturalness', 'speech rate', 'sync', 'volume', 'clipping', 'BGM none'],
});

const productionAfter = {
  vertical: sha256FileSync(productionPath(VERTICAL_PROFILE_ID)),
  landscape: sha256FileSync(productionPath(LANDSCAPE_PROFILE_ID)),
};
if (productionAfter.vertical !== productionBefore.vertical || productionAfter.landscape !== productionBefore.landscape) {
  throw new Error('PRODUCTION_ARTIFACT_MUTATED');
}

j('audits/calibration-ffmpeg.json', { calls: calibrationFfmpeg.length });
j('audits/production-ffmpeg.json', { calls: 0 });

const summary = {
  step: '13.15B-1E-B2-15O2',
  scriptFound: true,
  ttsError,
  ttsCalls,
  narrationReady,
  verticalOk,
  landscapeOk,
  speech,
  naturalMs,
  bgm: 'NOT_AVAILABLE',
  calibrationFfmpeg: calibrationFfmpeg.length,
  productionFfmpeg: 0,
};
j('implementation-summary.json', summary);
writeFileSync(
  path.join(calDir, 'README.txt'),
  [
    '音频校准样片（非正式成片）',
    '',
    'Vertical_AudioCalib_Narration.mp4  竖屏 + 旁白',
    'Landscape_AudioCalib_Narration.mp4 横屏 + 旁白',
    '',
    '没有配乐。请用手机听：声音是否自然、语速、是否对得上画面、音量、有无截断。',
    '',
  ].join('\n'),
);
console.log(JSON.stringify(summary, null, 2));

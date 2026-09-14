import { createHash } from 'node:crypto';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as PREVIEW } from '../source-aware-preview/render-config.js';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import type { RuntimeTimelineSegmentV1 } from '../source-aware-editorial/timeline.js';
import { VERTICAL_PRODUCTION_ENCODE } from '../source-aware-output/production-render.js';
import { SHARPEN_LIGHT } from '../vertical-fidelity-repair/repair.js';
import { loadFrozenScriptBeats, buildNarrationUnits } from '../editorial-shot-director/narration-units.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { isCalibrationArtifactPath } from '../source-aware-output/final-readiness.js';

export const FINAL_NARRATION_TIMELINE_VERSION = 'final.narration-timeline:v1' as const;
export const AUDIO_CALIBRATION_VERSION = 'audio.calibration:v1' as const;
export const FROZEN_SCRIPT_ID = '01a08c1d-46ce-7951-82ed-2eddd2394faa';
export const FROZEN_SCRIPT_VERSION = 'production-preflight/script-beats.json';
export const VIDEO_DURATION_MS = 35067;
export const SELECTED_V2_SHARPEN = SHARPEN_LIGHT;
export const AUDIO_POLICY = {
  codec: 'aac' as const,
  sampleRate: 48000,
  channels: 2,
  bitrateK: 160,
  loudnessI: -16,
  truePeak: -1.0,
  lra: 11,
  fadeInMs: 40,
  fadeOutMs: 250,
  tailSilenceMs: 400,
  pauseMs: 80,
  minSpeechRate: 0.9,
  maxSpeechRate: 1.1,
  avDeltaMs: 100,
};
export const SYNC_MODES = ['EXACT_TIMELINE', 'ESTIMATED_ALIGNMENT', 'STRETCHED_TO_FIT'] as const;
export type SyncModeV1 = (typeof SYNC_MODES)[number];

export type FinalNarrationTimelineUnitV1 = {
  unitId: string;
  textRef: string;
  startMs: number;
  endMs: number;
  audioAssetRef: string | null;
  visualBindingRef: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  syncMode: SyncModeV1;
};

export function frozenScriptFingerprint(): string {
  const beats = loadFrozenScriptBeats();
  return createHash('sha256').update(JSON.stringify(beats.map((b) => ({ id: b.id, narration: b.narration })))).digest('hex');
}

export function scriptAudit() {
  const beats = loadFrozenScriptBeats();
  const text = beats.map((b) => b.narration).join('');
  return {
    scriptId: FROZEN_SCRIPT_ID,
    scriptVersion: FROZEN_SCRIPT_VERSION,
    found: true,
    rewriteForbidden: true,
    narrationUnitCount: beats.length,
    totalNarrationTextLength: text.length,
    expectedDurationSec: beats.reduce((s, b) => s + b.expectedDuration, 0),
    timelineBindingState: 'ESTIMATED_ALIGNMENT' as const,
    fingerprint: frozenScriptFingerprint(),
    units: beats.map((b) => ({ id: b.id, textRef: `script-beat:${b.id}`, chars: b.narration.length })),
  };
}

export function estimatedVisualTimeline(durationMs = VIDEO_DURATION_MS) {
  return buildNarrationUnits({ durationMs }).map((unit) => ({
    unitId: unit.unitId,
    textRef: unit.textRef,
    visualStartMs: unit.startMs,
    visualEndMs: unit.endMs,
    summary: unit.summary,
    syncMode: 'ESTIMATED_ALIGNMENT' as const,
    confidence: 'MEDIUM' as const,
    provenance: unit.provenance,
  }));
}

export function speechRatePlan(naturalMs: number, videoMs: number): {
  atempo: number;
  syncMode: SyncModeV1;
  ok: boolean;
  reason: string;
} {
  const tail = AUDIO_POLICY.tailSilenceMs;
  const usable = Math.max(1, videoMs - tail);
  if (naturalMs <= usable) {
    return { atempo: 1, syncMode: 'ESTIMATED_ALIGNMENT', ok: true, reason: 'NATURAL_FITS_WITH_PAUSE_AND_TAIL' };
  }
  const rate = naturalMs / usable;
  if (rate <= AUDIO_POLICY.maxSpeechRate) {
    return { atempo: Number(rate.toFixed(3)), syncMode: 'STRETCHED_TO_FIT', ok: true, reason: 'MILD_ATEMPO_WITHIN_0.90_1.10' };
  }
  return {
    atempo: AUDIO_POLICY.maxSpeechRate,
    syncMode: 'STRETCHED_TO_FIT',
    ok: false,
    reason: 'SPEECH_LONGER_THAN_VIDEO_AT_NATURAL_RATE_NEEDS_HUMAN_SCRIPT_TIMING_REVIEW',
  };
}

export function sequentialLayout(input: {
  units: Array<{ unitId: string; textRef: string; naturalMs: number; visualBindingRef: string }>;
  videoMs: number;
  atempo: number;
}): FinalNarrationTimelineUnitV1[] {
  let cursor = 0;
  return input.units.map((unit, index) => {
    const dur = unit.naturalMs / input.atempo;
    const startMs = Math.round(cursor);
    const endMs = Math.round(cursor + dur);
    cursor = endMs + (index === input.units.length - 1 ? 0 : AUDIO_POLICY.pauseMs / input.atempo);
    return {
      unitId: unit.unitId,
      textRef: unit.textRef,
      startMs,
      endMs,
      audioAssetRef: `audio/${unit.unitId.replace(':', '_')}.bin`,
      visualBindingRef: unit.visualBindingRef,
      confidence: 'MEDIUM',
      syncMode: input.atempo === 1 ? 'ESTIMATED_ALIGNMENT' : 'STRETCHED_TO_FIT',
    };
  });
}

export function buildVerticalV2CalibrationFilter(input: {
  segments: readonly RuntimeTimelineSegmentV1[];
  sourceWidth: number;
  sourceHeight: number;
}): { filter: string; sharpen: string; productionUsable: false } {
  const parts: string[] = [];
  const labels: string[] = [];
  const { width, height, scaler, fps } = VERTICAL_PRODUCTION_ENCODE;
  input.segments.forEach((segment, index) => {
    const crop = pixelCropFromNormalized(segment.normalizedCrop, input.sourceWidth, input.sourceHeight);
    const start = (segment.sourceStartMs / 1000).toFixed(3);
    const end = (segment.sourceEndMs / 1000).toFixed(3);
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${fps},split=2[${fg}][${bg}]`);
    parts.push(
      `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2,${SELECTED_V2_SHARPEN}[${fgc}]`,
    );
    parts.push(
      `[${bg}]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[${bgb}]`,
    );
    parts.push(
      `[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,fps=${fps},setpts=PTS-STARTPTS[${out}]`,
    );
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${input.segments.length}:v=1:a=0[outv]`);
  return { filter: parts.join(';'), sharpen: SELECTED_V2_SHARPEN, productionUsable: false };
}

export function muxAacArgs(videoPath: string, audioPath: string, outputPath: string, videoDurSec: number): string[] {
  if (outputPath.replaceAll('\\', '/').includes('/production-artifacts/')) throw new Error('MUST_NOT_WRITE_PRODUCTION_ARTIFACT');
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    videoPath,
    '-i',
    audioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    `${AUDIO_POLICY.bitrateK}k`,
    '-ar',
    String(AUDIO_POLICY.sampleRate),
    '-ac',
    String(AUDIO_POLICY.channels),
    '-t',
    videoDurSec.toFixed(3),
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function loudnormFilter(measured?: { i: number; tp: number; lra: number; thresh: number; offset: number }): string {
  if (!measured) return `loudnorm=I=${AUDIO_POLICY.loudnessI}:TP=${AUDIO_POLICY.truePeak}:LRA=${AUDIO_POLICY.lra}:print_format=json`;
  return `loudnorm=I=${AUDIO_POLICY.loudnessI}:TP=${AUDIO_POLICY.truePeak}:LRA=${AUDIO_POLICY.lra}:measured_I=${measured.i}:measured_TP=${measured.tp}:measured_LRA=${measured.lra}:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true:print_format=json`;
}

export function parseLoudnormJson(text: string): Record<string, number> | null {
  const match = /\{[\s\S]*"input_i"[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const json = JSON.parse(match[0]) as Record<string, string>;
    return {
      input_i: Number(json.input_i),
      input_tp: Number(json.input_tp),
      input_lra: Number(json.input_lra),
      input_thresh: Number(json.input_thresh),
      output_i: Number(json.output_i),
      output_tp: Number(json.output_tp),
      target_offset: Number(json.target_offset),
    };
  } catch {
    return null;
  }
}

export function assertCalibOutputPath(filePath: string): void {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (lower.includes('/production-artifacts/')) throw new Error('MUST_NOT_WRITE_PRODUCTION_ARTIFACT');
}

export function assertNotPreviewSource(filePath: string): void {
  if (isPreviewOfPreviewPath(filePath) || isCalibrationArtifactPath(filePath)) throw new Error('INVALID_AUDIO_CALIB_VISUAL_CHAIN');
}

export function ttsProviderAuditFromEnv(env: NodeJS.ProcessEnv): {
  provider: string | null;
  configured: boolean;
  missing: string[];
  mockBlocked: boolean;
} {
  const raw = env.MEDIA_TTS_PROVIDER?.trim() ?? '';
  const missing: string[] = [];
  if (!raw) missing.push('MEDIA_TTS_PROVIDER');
  if (raw === 'mock') return { provider: 'mock', configured: false, missing: [], mockBlocked: true };
  if (raw === 'openai-tts') {
    if (!env.TTS_API_KEY?.trim()) missing.push('TTS_API_KEY');
    if (!env.TTS_BASE_URL?.trim()) missing.push('TTS_BASE_URL');
    if (!env.TTS_MODEL?.trim()) missing.push('TTS_MODEL');
    return { provider: raw, configured: missing.length === 0, missing, mockBlocked: false };
  }
  if (raw === 'minimax-tts') {
    if (!env.MINIMAX_TTS_API_KEY?.trim()) missing.push('MINIMAX_TTS_API_KEY');
    if (!env.MINIMAX_TTS_BASE_URL?.trim()) missing.push('MINIMAX_TTS_BASE_URL');
    if (!env.MINIMAX_TTS_VOICE?.trim()) missing.push('MINIMAX_TTS_VOICE');
    return { provider: raw, configured: missing.length === 0, missing, mockBlocked: false };
  }
  if (raw) missing.push('MEDIA_TTS_PROVIDER_UNSUPPORTED_VALUE');
  return { provider: raw || null, configured: false, missing, mockBlocked: false };
}

export function bgmPolicy(hasLicensedAsset: boolean) {
  return {
    optional: true,
    used: false,
    available: hasLicensedAsset,
    source: hasLicensedAsset ? 'LICENSED_OR_USER_ASSET' : 'NONE',
    downloadForbidden: true,
    narrationOnlyLegal: !hasLicensedAsset,
  };
}

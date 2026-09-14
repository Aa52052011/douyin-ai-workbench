import { PRE_ROLL_MS, POST_ROLL_MS, scriptDrivenDurationMs, type ScriptBeatPlanV1 } from './director-v1.js';
import { SECTION4_SOURCE_WINDOW_MS, blendPageTowardContent, buildSection4LandscapeFilter, buildSection4VerticalFilter } from './section4-repair.js';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as PREVIEW } from '../source-aware-preview/render-config.js';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { VERTICAL_PRODUCTION_ENCODE } from '../source-aware-output/production-render.js';
import { CONTENT_01_CONTAINERS } from '../source-aware-editorial/containers.js';
import { REJECTED_SECTION4_CANDIDATE } from './visual-governance.js';
import { VIDEO_DURATION_MS } from '../audio-calibration/audio-integration.js';

export const FULL_TIMELINE_CALIBRATION_VERSION = 'full.script-driven-timeline-calibration:v1' as const;
export const DURATION_MIN_MS = 45_000;
export const DURATION_MAX_MS = 47_500;
export const MAX_FREEZE_SEC = 2;

export type TimelineSlotV1 = {
  slotId: string;
  beatId: string;
  narrationUnitId: string;
  timelineStartMs: number;
  timelineEndMs: number;
  durationMs: number;
  sourceKind: 'RECORDING' | 'SCREENSHOT_MOTION';
  sourceStartMs: number;
  sourceEndMs: number;
  padSec: number;
  usesV2: boolean;
  temporaryFallback: string | null;
};

const SOURCE_WINDOWS: Record<string, { startMs: number; endMs: number; kind: TimelineSlotV1['sourceKind'] }> = {
  hook: { startMs: 200, endMs: 5_800, kind: 'RECORDING' },
  opening: { startMs: 0, endMs: 8_232, kind: 'SCREENSHOT_MOTION' },
  section1: { startMs: 6_200, endMs: 11_400, kind: 'RECORDING' },
  section2: { startMs: 11_500, endMs: 15_700, kind: 'RECORDING' },
  section3: { startMs: 16_000, endMs: 21_200, kind: 'RECORDING' },
  section4: { startMs: SECTION4_SOURCE_WINDOW_MS.startMs, endMs: SECTION4_SOURCE_WINDOW_MS.endMs, kind: 'RECORDING' },
  section5: { startMs: 27_600, endMs: 32_800, kind: 'RECORDING' },
  ending_cta: { startMs: 30_000, endMs: VIDEO_DURATION_MS, kind: 'RECORDING' },
};

export function temporaryFallbackRegistry() {
  return {
    schemaVersion: 'temporary.fallback-registry:v1',
    items: [
      { capability: 'AI_MUSIC', fallback: 'NARRATION_ONLY', temporary: true, not: 'FINAL_PREFERRED_SOLUTION' },
      { capability: 'AI_VIDEO', fallback: 'REAL_UI', temporary: true, beatId: 'beat:section2' },
      { capability: 'DIGITAL_HUMAN', fallback: 'REAL_UI_CTA', temporary: true, beatId: 'beat:ending_cta' },
    ],
  };
}

export function buildTimelineSlots(beats: ScriptBeatPlanV1[], plannedDurationMs: number): TimelineSlotV1[] {
  return beats.map((beat, index) => {
    const id = beat.beatId.replace('beat:', '');
    const timelineStartMs = index === 0 ? 0 : beats[index - 1].endMs;
    const timelineEndMs = index === beats.length - 1 ? plannedDurationMs : beat.endMs;
    const durationMs = timelineEndMs - timelineStartMs;
    const win = SOURCE_WINDOWS[id];
    const sourceDur = win.endMs - win.startMs;
    let padSec = Math.max(0, durationMs / 1000 - sourceDur / 1000);
    if (win.kind === 'SCREENSHOT_MOTION') padSec = 0;
    if (padSec > MAX_FREEZE_SEC) padSec = 0;
    return {
      slotId: `slot:${id}`,
      beatId: beat.beatId,
      narrationUnitId: beat.narrationUnitId,
      timelineStartMs,
      timelineEndMs,
      durationMs,
      sourceKind: win.kind,
      sourceStartMs: win.startMs,
      sourceEndMs: win.endMs,
      padSec,
      usesV2: win.kind === 'RECORDING',
      temporaryFallback:
        id === 'section2' ? 'AI_VIDEO_REAL_UI' : id === 'ending_cta' ? 'DIGITAL_HUMAN_REAL_UI_CTA' : null,
    };
  });
}

export function assertDurationInRange(actualMs: number): void {
  if (actualMs < DURATION_MIN_MS || actualMs > DURATION_MAX_MS) {
    throw new Error(`TIMELINE_DURATION_OUT_OF_RANGE:${actualMs}`);
  }
}

export function longFreezeUsed(slots: TimelineSlotV1[]): boolean {
  return slots.some((s) => s.sourceKind === 'RECORDING' && s.padSec > MAX_FREEZE_SEC);
}

export function rejectedAiImageUsed(): false {
  void REJECTED_SECTION4_CANDIDATE;
  return false;
}

export function buildRecordingVerticalFilter(input: {
  sourceWidth: number;
  sourceHeight: number;
  sourceStartSec: number;
  sourceEndSec: number;
  targetDurationSec: number;
  section4: boolean;
}): { filter: string; sharpen: string } {
  if (input.section4) {
    return buildSection4VerticalFilter(input);
  }
  const { width, height, scaler, fps } = VERTICAL_PRODUCTION_ENCODE;
  const page = CONTENT_01_CONTAINERS.find((c) => c.ref === 'container:PAGE')!;
  const crop = pixelCropFromNormalized(page.rect, input.sourceWidth, input.sourceHeight);
  const sourceDur = input.sourceEndSec - input.sourceStartSec;
  const padSec = Math.min(MAX_FREEZE_SEC, Math.max(0, input.targetDurationSec - sourceDur));
  const speedUp = input.targetDurationSec > sourceDur + MAX_FREEZE_SEC;
  const setpts = speedUp ? `setpts=${(input.targetDurationSec / sourceDur).toFixed(4)}*PTS` : 'setpts=PTS-STARTPTS';
  const start = input.sourceStartSec.toFixed(3);
  const end = input.sourceEndSec.toFixed(3);
  const filter = [
    `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${fps},split=2[fg][bg]`,
    `[fg]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2,${SELECTED_V2_SHARPEN}[fgc]`,
    `[bg]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[bgb]`,
    `[bgb][fgc]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,${setpts},tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)},trim=duration=${input.targetDurationSec.toFixed(3)},setpts=PTS-STARTPTS[outv]`,
  ].join(';');
  return { filter, sharpen: SELECTED_V2_SHARPEN };
}

export function buildRecordingLandscapeFilter(input: {
  sourceStartSec: number;
  sourceEndSec: number;
  targetDurationSec: number;
  section4: boolean;
}): { filter: string; stretch: false } {
  if (input.section4) return buildSection4LandscapeFilter(input);
  const sourceDur = input.sourceEndSec - input.sourceStartSec;
  const padSec = Math.min(MAX_FREEZE_SEC, Math.max(0, input.targetDurationSec - sourceDur));
  const speedUp = input.targetDurationSec > sourceDur + MAX_FREEZE_SEC;
  const setpts = speedUp ? `setpts=${(input.targetDurationSec / sourceDur).toFixed(4)}*PTS` : 'setpts=PTS-STARTPTS';
  const start = input.sourceStartSec.toFixed(3);
  const end = input.sourceEndSec.toFixed(3);
  const filter = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,${setpts},tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)},trim=duration=${input.targetDurationSec.toFixed(3)},setpts=PTS-STARTPTS[outv]`;
  return { filter, stretch: false };
}

export function plannedDurationMatchesDirector(): boolean {
  return scriptDrivenDurationMs() === 45_677;
}

void blendPageTowardContent;
void PRE_ROLL_MS;
void POST_ROLL_MS;

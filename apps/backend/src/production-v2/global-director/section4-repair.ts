import { CONTENT_01_CONTAINERS } from '../source-aware-editorial/containers.js';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as PREVIEW } from '../source-aware-preview/render-config.js';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { VERTICAL_PRODUCTION_ENCODE } from '../source-aware-output/production-render.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { PRODUCT_INFO_IMAGE_ID, REJECTED_SECTION4_CANDIDATE } from './visual-governance.js';

/** Frozen estimated visual window on the 35.067s source for section4 (O2 narration-audit). */
export const SECTION4_SOURCE_WINDOW_MS = { startMs: 21_845, endMs: 27_594 };

export function blendPageTowardContent(): { x: number; y: number; width: number; height: number } {
  const page = CONTENT_01_CONTAINERS.find((c) => c.ref === 'container:PAGE')!;
  const content = CONTENT_01_CONTAINERS.find((c) => c.ref === 'container:CONTENT_PANEL')!;
  const t = 0.18;
  const x = page.rect.x + (content.rect.x - page.rect.x) * t;
  const y = page.rect.y + (content.rect.y - page.rect.y) * t;
  const x2 = page.rect.x + page.rect.width + (content.rect.x + content.rect.width - (page.rect.x + page.rect.width)) * t;
  const y2 = page.rect.y + page.rect.height + (content.rect.y + content.rect.height - (page.rect.y + page.rect.height)) * t;
  return { x, y, width: x2 - x, height: y2 - y };
}

export function section4SourceSelection() {
  return {
    primaryAssetId: CONTENT_01_NEW_ASSET_ID,
    screenshotAssetId: PRODUCT_INFO_IMAGE_ID,
    chosen: 'REAL_SCREEN_RECORDING',
    semanticGoal: 'EVIDENCE_OVER_PROMISE',
    rejectedAiImage: REJECTED_SECTION4_CANDIDATE,
    rejectedAiImageUsed: false,
    sourceWindowMs: SECTION4_SOURCE_WINDOW_MS,
    container: 'PAGE with mild emphasis toward CONTENT_PANEL',
  };
}

export function buildSection4VerticalFilter(input: {
  sourceWidth: number;
  sourceHeight: number;
  sourceStartSec: number;
  sourceEndSec: number;
  targetDurationSec: number;
}): { filter: string; sharpen: string; productionUsable: false } {
  const { width, height, scaler, fps } = VERTICAL_PRODUCTION_ENCODE;
  const crop = pixelCropFromNormalized(blendPageTowardContent(), input.sourceWidth, input.sourceHeight);
  const padSec = Math.max(0, input.targetDurationSec - (input.sourceEndSec - input.sourceStartSec));
  const start = input.sourceStartSec.toFixed(3);
  const end = input.sourceEndSec.toFixed(3);
  const filter = [
    `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${fps},split=2[fg][bg]`,
    `[fg]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2,${SELECTED_V2_SHARPEN}[fgc]`,
    `[bg]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[bgb]`,
    `[bgb][fgc]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)},trim=duration=${input.targetDurationSec.toFixed(3)},setpts=PTS-STARTPTS[outv]`,
  ].join(';');
  return { filter, sharpen: SELECTED_V2_SHARPEN, productionUsable: false };
}

export function buildSection4LandscapeFilter(input: {
  sourceStartSec: number;
  sourceEndSec: number;
  targetDurationSec: number;
}): { filter: string; stretch: false } {
  const padSec = Math.max(0, input.targetDurationSec - (input.sourceEndSec - input.sourceStartSec));
  const start = input.sourceStartSec.toFixed(3);
  const end = input.sourceEndSec.toFixed(3);
  const filter = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)},trim=duration=${input.targetDurationSec.toFixed(3)},setpts=PTS-STARTPTS[outv]`;
  return { filter, stretch: false };
}

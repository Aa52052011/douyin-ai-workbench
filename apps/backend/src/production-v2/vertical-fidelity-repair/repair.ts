import { createHash } from 'node:crypto';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as PREVIEW } from '../source-aware-preview/render-config.js';
import { CONTENT_01_CONTAINERS, contains, expandToContainer } from '../source-aware-editorial/containers.js';
import { smartUiFit } from '../source-aware-editorial/smart-ui-fit.js';
import { containLayout } from '../ui-fidelity-calibration/compose.js';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import { VERTICAL_PRODUCTION_ENCODE, assertProductionSourcePath } from '../source-aware-output/production-render.js';
import { isCalibrationArtifactPath } from '../source-aware-output/final-readiness.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

export const VERTICAL_FIDELITY_REPAIR_VERSION = 'vertical.fidelity-repair:v1' as const;
export const VERTICAL_TARGET = { width: 1080, height: 1920 } as const;
export const FROZEN_CRF = 18 as const;
export const SOURCE_GLYPH_PX = 25 as const;

export const SAMPLE_WINDOWS = [
  { startSec: 0, endSec: 5 },
  { startSec: 7, endSec: 12 },
  { startSec: 18, endSec: 23 },
  { startSec: 28, endSec: 33 },
] as const;

export const COMPARE_TIMES_SEC = [1, 8, 20, 30] as const;
export const BLANK_GAP_MS = { start: 6331, end: 9131 } as const;

export const REQUIRED_CONTAINER_REFS = [
  'container:HEADER',
  'container:NAVIGATION_PANEL',
  'container:CONTENT_PANEL',
  'container:TEXT_BLOCK',
  'container:CARD',
  'container:ACTION_GROUP',
  'container:STATUS_GROUP',
] as const;

export const SHARPEN_VERY_LIGHT = 'unsharp=3:3:0.25:3:3:0.0';
export const SHARPEN_LIGHT = 'unsharp=5:5:0.35:3:3:0.0';

export const SEMANTIC_CHECKS = [
  'NO_BROKEN_TEXT_LINE',
  'NO_BROKEN_CONTAINER',
  'NO_HALF_BUTTON',
  'NO_HALF_CARD',
  'NO_BROKEN_NAV',
  'NO_MEANINGLESS_CROP',
] as const;

export type TechnicalSafetyV1 = 'TECHNICALLY_SAFE' | 'TECHNICALLY_UNSAFE';

export function baselineCrop(): NormalizedRect {
  return smartUiFit().crop;
}

export function unionRects(rects: NormalizedRect[]): NormalizedRect {
  return rects.slice(1).reduce((acc, item) => expandToContainer(acc, item), rects[0]);
}

export function requiredContainers(): NormalizedRect[] {
  return REQUIRED_CONTAINER_REFS.map((ref) => CONTENT_01_CONTAINERS.find((item) => item.ref === ref)!.rect);
}

export function semanticIntegrity(crop: NormalizedRect): { pass: boolean; failed: string[] } {
  const failed: string[] = [];
  const page = CONTENT_01_CONTAINERS[0].rect;
  if (!contains(page, crop, 0.02) && (crop.width > page.width + 0.02 || crop.height > page.height + 0.02)) {
    failed.push('NO_MEANINGLESS_CROP');
  }
  const byRef = (ref: string) => CONTENT_01_CONTAINERS.find((item) => item.ref === ref)!.rect;
  if (!contains(crop, byRef('container:TEXT_BLOCK'))) failed.push('NO_BROKEN_TEXT_LINE');
  if (!contains(crop, byRef('container:CONTENT_PANEL'))) failed.push('NO_BROKEN_CONTAINER');
  if (!contains(crop, byRef('container:ACTION_GROUP'))) failed.push('NO_HALF_BUTTON');
  if (!contains(crop, byRef('container:CARD'))) failed.push('NO_HALF_CARD');
  if (!contains(crop, byRef('container:NAVIGATION_PANEL'))) failed.push('NO_BROKEN_NAV');
  if (!contains(crop, byRef('container:HEADER'))) failed.push('NO_MEANINGLESS_CROP');
  return { pass: failed.length === 0, failed };
}

export function occupancyTighten(input: {
  page: NormalizedRect;
  required: NormalizedRect[];
  contentBBox?: NormalizedRect | null;
}): {
  crop: NormalizedRect;
  widthShrink: number;
  scaleGain: number;
  glyphGainPx: number;
  technically: TechnicalSafetyV1;
  reason: string;
} {
  const page = input.page;
  const requiredUnion = unionRects(input.required);
  const paddedUnion = {
    x: Math.max(0, requiredUnion.x - 0.012),
    y: Math.max(0, requiredUnion.y - 0.012),
    width: Math.min(1, requiredUnion.width + 0.024),
    height: Math.min(1, requiredUnion.height + 0.024),
  };
  let candidate = {
    x: Math.max(page.x, paddedUnion.x),
    y: Math.max(page.y, paddedUnion.y),
    width: Math.min(page.x + page.width, paddedUnion.x + paddedUnion.width) - Math.max(page.x, paddedUnion.x),
    height: Math.min(page.y + page.height, paddedUnion.y + paddedUnion.height) - Math.max(page.y, paddedUnion.y),
  };
  if (input.contentBBox) {
    const box = input.contentBBox;
    candidate = {
      x: Math.max(candidate.x, box.x),
      y: Math.max(candidate.y, box.y),
      width: Math.min(candidate.x + candidate.width, box.x + box.width) - Math.max(candidate.x, box.x),
      height: Math.min(candidate.y + candidate.height, box.y + box.height) - Math.max(candidate.y, box.y),
    };
  }
  for (const rect of input.required) {
    candidate = expandToContainer(candidate, rect);
  }
  candidate.x = Math.max(page.x, candidate.x);
  candidate.y = Math.max(page.y, candidate.y);
  const x2 = Math.min(page.x + page.width, candidate.x + candidate.width);
  const y2 = Math.min(page.y + page.height, candidate.y + candidate.height);
  candidate = { x: candidate.x, y: candidate.y, width: x2 - candidate.x, height: y2 - candidate.y };

  const integrity = semanticIntegrity(candidate);
  const src = { width: 1920, height: 1040 };
  const basePx = pixelCropFromNormalized(page, src.width, src.height);
  const candPx = pixelCropFromNormalized(candidate, src.width, src.height);
  const baseScale = containLayout(basePx, VERTICAL_TARGET).scale;
  const candScale = containLayout(candPx, VERTICAL_TARGET).scale;
  const widthShrink = (basePx.width - candPx.width) / basePx.width;
  const scaleGain = candScale / baseScale - 1;
  const glyphGainPx = SOURCE_GLYPH_PX * (candScale - baseScale);

  if (!integrity.pass) {
    return {
      crop: page,
      widthShrink: 0,
      scaleGain: 0,
      glyphGainPx: 0,
      technically: 'TECHNICALLY_UNSAFE',
      reason: `SEMANTIC_FAIL:${integrity.failed.join(',')}`,
    };
  }
  if (widthShrink < 0.015 || glyphGainPx < 0.4) {
    return {
      crop: page,
      widthShrink,
      scaleGain,
      glyphGainPx,
      technically: 'TECHNICALLY_UNSAFE',
      reason: 'NO_SAFE_WIDTH_OCCUPANCY_GAIN_WITHOUT_CUTTING_WHOLE_UI',
    };
  }
  return {
    crop: candidate,
    widthShrink,
    scaleGain,
    glyphGainPx,
    technically: 'TECHNICALLY_SAFE',
    reason: 'WIDTH_OCCUPANCY_IMPROVED_WITH_SEMANTIC_INTEGRITY',
  };
}

export function layoutForCrop(crop: NormalizedRect) {
  const px = pixelCropFromNormalized(crop, 1920, 1040);
  const layout = containLayout(px, VERTICAL_TARGET);
  return {
    ...layout,
    cropPx: px,
    typicalGlyphHeight: SOURCE_GLYPH_PX * layout.scale,
  };
}

export function assertCalibrationDirectFromOriginal(filePath: string): void {
  assertProductionSourcePath(filePath);
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (lower.includes('/production-artifacts/')) throw new Error('PRODUCTION_AS_CALIBRATION_SOURCE');
  if (isCalibrationArtifactPath(filePath)) throw new Error('CALIBRATION_CHAIN_FORBIDDEN');
  if (lower.includes('v0_baseline') || lower.includes('v1_occupancy') || lower.includes('v2_light_sharpen')) {
    throw new Error('CALIBRATION_CHAIN_FORBIDDEN');
  }
}

export function assertNotProductionMutationTarget(filePath: string): void {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (lower.includes('/production-artifacts/') && lower.endsWith('.mp4')) {
    throw new Error('MUST_NOT_WRITE_PRODUCTION_ARTIFACT');
  }
}

export function buildVerticalSampleFilter(input: {
  crop: NormalizedRect;
  sourceWidth: number;
  sourceHeight: number;
  sharpen?: string | null;
  windows?: readonly { startSec: number; endSec: number }[];
}): { filter: string; usesLanczos: true; sharpenApplied: boolean } {
  const windows = input.windows ?? SAMPLE_WINDOWS;
  const crop = pixelCropFromNormalized(input.crop, input.sourceWidth, input.sourceHeight);
  const { width, height, scaler, fps } = VERTICAL_PRODUCTION_ENCODE;
  const sharpen = input.sharpen ? `,${input.sharpen}` : '';
  const parts: string[] = [];
  const labels: string[] = [];
  windows.forEach((window, index) => {
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    parts.push(
      `[0:v]trim=start=${window.startSec}:end=${window.endSec},setpts=PTS-STARTPTS,fps=${fps},split=2[${fg}][${bg}]`,
    );
    parts.push(
      `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2${sharpen}[${fgc}]`,
    );
    parts.push(
      `[${bg}]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[${bgb}]`,
    );
    parts.push(
      `[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,fps=${fps},setpts=PTS-STARTPTS[${out}]`,
    );
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${windows.length}:v=1:a=0[outv]`);
  const filter = parts.join(';');
  if (filter.includes('scale=1440') || filter.includes('scale=2160')) throw new Error('RESOLUTION_NOT_FROZEN');
  return { filter, usesLanczos: true, sharpenApplied: Boolean(input.sharpen) };
}

export function sampleFfmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
  assertCalibrationDirectFromOriginal(inputPath);
  assertNotProductionMutationTarget(outputPath);
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-an',
    '-c:v',
    VERTICAL_PRODUCTION_ENCODE.codec,
    '-preset',
    VERTICAL_PRODUCTION_ENCODE.preset,
    '-crf',
    String(FROZEN_CRF),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function stillFilter(input: { crop: NormalizedRect; sourceWidth: number; sourceHeight: number; sharpen?: string | null }): string {
  const crop = pixelCropFromNormalized(input.crop, input.sourceWidth, input.sourceHeight);
  const { width, height, scaler } = VERTICAL_PRODUCTION_ENCODE;
  const sharpen = input.sharpen ? `,${input.sharpen}` : '';
  return [
    `split=2[fg][bg]`,
    `[fg]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2${sharpen}[fgc]`,
    `[bg]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[bgb]`,
    `[bgb][fgc]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`,
  ].join(';');
}

export function haloIndex(baselineGray: Buffer, candidateGray: Buffer, width: number, height: number): {
  whiteFringeRatio: number;
  darkRingRatio: number;
  meanAbsDiff: number;
  fail: boolean;
} {
  const n = width * height;
  let white = 0;
  let dark = 0;
  let abs = 0;
  for (let i = 0; i < n; i += 1) {
    const d = candidateGray[i] - baselineGray[i];
    abs += Math.abs(d);
    if (d >= 18) white += 1;
    if (d <= -18) dark += 1;
  }
  const whiteFringeRatio = white / n;
  const darkRingRatio = dark / n;
  const meanAbsDiff = abs / n;
  return {
    whiteFringeRatio,
    darkRingRatio,
    meanAbsDiff,
    fail: whiteFringeRatio > 0.035 || darkRingRatio > 0.035 || meanAbsDiff > 9,
  };
}

export function localContrast(gray: Buffer): number {
  const n = gray.length;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i += 1) {
    sum += gray[i];
    sum2 += gray[i] * gray[i];
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
}

export function gradientMagnitude(gray: Buffer, width: number, height: number): number {
  let acc = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = gray[i + 1] - gray[i - 1];
      const gy = gray[i + width] - gray[i - width];
      acc += Math.hypot(gx, gy);
      count += 1;
    }
  }
  return acc / Math.max(1, count);
}

export function contentBBoxFromGray(raw: Buffer, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  const colVar: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let sum2 = 0;
    for (let y = 0; y < height; y += 1) {
      const v = raw[y * width + x];
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / height;
    colVar.push(sum2 / height - mean * mean);
  }
  const rowVar: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let sum2 = 0;
    for (let x = 0; x < width; x += 1) {
      const v = raw[y * width + x];
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / width;
    rowVar.push(sum2 / width - mean * mean);
  }
  const meanCol = colVar.reduce((a, b) => a + b, 0) / colVar.length;
  const meanRow = rowVar.reduce((a, b) => a + b, 0) / rowVar.length;
  const cThresh = meanCol * 0.18;
  const rThresh = meanRow * 0.18;
  const firstCol = colVar.findIndex((v) => v > cThresh);
  const lastCol = colVar.length - 1 - [...colVar].reverse().findIndex((v) => v > cThresh);
  const firstRow = rowVar.findIndex((v) => v > rThresh);
  const lastRow = rowVar.length - 1 - [...rowVar].reverse().findIndex((v) => v > rThresh);
  if (firstCol < 0 || firstRow < 0 || lastCol <= firstCol || lastRow <= firstRow) return null;
  return { x: firstCol, y: firstRow, width: lastCol - firstCol + 1, height: lastRow - firstRow + 1 };
}

export function pickSharpen(antiRinging: Array<{ id: string; fail: boolean; edgeGain: number }>): {
  id: 'very-light' | 'light' | null;
  filter: string | null;
  technically: TechnicalSafetyV1;
  reason: string;
} {
  const safe = antiRinging.filter((item) => !item.fail && item.edgeGain > 1.01 && item.edgeGain < 1.28);
  const light = safe.find((item) => item.id === 'light');
  const very = safe.find((item) => item.id === 'very-light');
  const chosen = light ?? very;
  if (!chosen) {
    return { id: null, filter: null, technically: 'TECHNICALLY_UNSAFE', reason: 'ALL_SHARPEN_FAILED_ANTI_RINGING_OR_NO_GAIN' };
  }
  return {
    id: chosen.id as 'very-light' | 'light',
    filter: chosen.id === 'light' ? SHARPEN_LIGHT : SHARPEN_VERY_LIGHT,
    technically: 'TECHNICALLY_SAFE',
    reason: chosen.id === 'light' ? 'LIGHT_SHARPEN_SAFE' : 'VERY_LIGHT_SHARPEN_SAFE',
  };
}

export function reduceMobileCandidates(input: {
  v1Safe: boolean;
  v1GlyphGainPx: number;
  v2Safe: boolean;
  v3Safe: boolean;
}): Array<'V0' | 'V1' | 'V2' | 'V3'> {
  const out: Array<'V0' | 'V1' | 'V2' | 'V3'> = ['V0'];
  if (input.v1Safe && input.v1GlyphGainPx >= 0.4 && input.v3Safe) {
    out.push('V1', 'V3');
    return out;
  }
  if (input.v2Safe) out.push('V2');
  else if (input.v1Safe && input.v1GlyphGainPx >= 0.4) out.push('V1');
  return out;
}

export function compositionFingerprint(crop: NormalizedRect, sharpen: string | null): string {
  return createHash('sha256')
    .update(JSON.stringify({ crop, sharpen, target: VERTICAL_TARGET, crf: FROZEN_CRF, scaler: 'lanczos' }))
    .digest('hex');
}

export function rootCauseAnalysis(input: { effectiveScale: number; typicalGlyphHeight: number }): Record<string, unknown> {
  const downscale = 1574 / 1080;
  return {
    primary:
      'WHOLE_PAGE_UI_WIDTH_DOWNSCALE_1080: landscape-ish SMART_UI_FIT crop (~1574px) contain-fit into 1080px drops glyph from ~25px to ~17px',
    hypotheses: {
      A_widthDownscale: { likely: true, scale: input.effectiveScale, mappedGlyphPx: input.typicalGlyphHeight },
      B_lanczosRinging: { likely: true, note: 'lanczos on fine UI strokes can add ringing/alias on 17px glyphs' },
      C_yuv420pH264: { likely: 'secondary', note: 'chroma 4:2:0 and H.264 soften 1px UI edges; CRF18 already frozen as not the main lever' },
      D_occupancyTooSmall: { likely: input.effectiveScale < 0.75, note: 'width-limited contain; height pad is not the limiter' },
      E_lightSharpen: { likely: 'candidate', note: 'may restore edge contrast without increasing glyph px' },
    },
    notTheGoal: 'do not enlarge all page text to huge sizes',
    frozen: { resolution: '1080x1920', crf: 18, landscapeUnchanged: true },
    downscaleFactorApprox: downscale,
  };
}

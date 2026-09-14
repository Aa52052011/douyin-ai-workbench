import { createHash } from 'node:crypto';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import type { NormalizedRect } from '../visual/geometry/types.js';
import type { RuntimeTimelineSegmentV1 } from '../source-aware-editorial/timeline.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as BASE } from '../source-aware-preview/render-config.js';

function even(value: number): number {
  return value - (value % 2);
}

export type CalibrationTargetV1 = {
  id: 'A' | 'B' | 'C';
  width: number;
  height: number;
  crf: number;
  preset: 'medium' | 'slow';
  scalerFlags: string;
  calibrationOnly: true;
  productionUsable: false;
};

export const CALIBRATION_A: CalibrationTargetV1 = {
  id: 'A',
  width: 720,
  height: 1280,
  crf: 20,
  preset: 'medium',
  scalerFlags: 'lanczos',
  calibrationOnly: true,
  productionUsable: false,
};

export const CALIBRATION_B: CalibrationTargetV1 = {
  id: 'B',
  width: 1080,
  height: 1920,
  crf: 18,
  preset: 'medium',
  scalerFlags: 'lanczos',
  calibrationOnly: true,
  productionUsable: false,
};

export const CALIBRATION_C: CalibrationTargetV1 = {
  id: 'C',
  width: 1080,
  height: 1920,
  crf: 16,
  preset: 'medium',
  scalerFlags: 'lanczos+accurate_rnd+full_chroma_int',
  calibrationOnly: true,
  productionUsable: false,
};

export function compositionHash(input: {
  assetId: string;
  crop: NormalizedRect;
  fitMode: string;
  background: string;
  timeline: Array<{ startMs: number; endMs: number }>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        assetId: input.assetId,
        crop: input.crop,
        fitMode: input.fitMode,
        background: input.background,
        timeline: input.timeline,
        smartUiFit: 'smart-ui-fit:v1',
      }),
    )
    .digest('hex');
}

export function containLayout(crop: { width: number; height: number }, target: { width: number; height: number }) {
  const scale = Math.min(target.width / crop.width, target.height / crop.height);
  const fgWidth = even(Math.max(2, Math.round(crop.width * scale)));
  const fgHeight = even(Math.max(2, Math.round(crop.height * scale)));
  return {
    scale,
    fgWidth,
    fgHeight,
    overlayX: even(Math.floor((target.width - fgWidth) / 2)),
    overlayY: even(Math.floor((target.height - fgHeight) / 2)),
    occupancy: (fgWidth * fgHeight) / (target.width * target.height),
  };
}

export function mapSourceRectToOutput(
  rect: NormalizedRect,
  source: { width: number; height: number },
  cropNorm: NormalizedRect,
  target: { width: number; height: number },
) {
  const crop = pixelCropFromNormalized(cropNorm, source.width, source.height);
  const layout = containLayout(crop, target);
  const src = pixelCropFromNormalized(rect, source.width, source.height);
  const x = layout.overlayX + Math.round(((src.x - crop.x) / crop.width) * layout.fgWidth);
  const y = layout.overlayY + Math.round(((src.y - crop.y) / crop.height) * layout.fgHeight);
  const width = Math.max(2, Math.round((src.width / crop.width) * layout.fgWidth));
  const height = Math.max(2, Math.round((src.height / crop.height) * layout.fgHeight));
  return { x: even(Math.max(0, x)), y: even(Math.max(0, y)), width: even(width), height: even(height) };
}

export function buildCalibrationFilterGraph(input: {
  segments: readonly RuntimeTimelineSegmentV1[];
  sourceWidth: number;
  sourceHeight: number;
  target: CalibrationTargetV1;
}): { filter: string; usesLanczos: boolean } {
  const parts: string[] = [];
  const labels: string[] = [];
  input.segments.forEach((segment, index) => {
    const crop = pixelCropFromNormalized(segment.normalizedCrop, input.sourceWidth, input.sourceHeight);
    const start = (segment.sourceStartMs / 1000).toFixed(3);
    const end = (segment.sourceEndMs / 1000).toFixed(3);
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${BASE.fps},split=2[${fg}][${bg}]`);
    parts.push(
      `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${input.target.width}:${input.target.height}:flags=${input.target.scalerFlags}:force_original_aspect_ratio=decrease:force_divisible_by=2[${fgc}]`,
    );
    parts.push(
      `[${bg}]scale=${input.target.width}:${input.target.height}:flags=${input.target.scalerFlags}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${input.target.width}:${input.target.height},boxblur=${BASE.blurLuma}:${BASE.blurChroma},eq=brightness=${BASE.wideBgBrightness}[${bgb}]`,
    );
    parts.push(
      `[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,fps=${BASE.fps},setpts=PTS-STARTPTS[${out}]`,
    );
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${input.segments.length}:v=1:a=0[outv]`);
  const filter = parts.join(';');
  return { filter, usesLanczos: filter.includes('lanczos') };
}

export function calibrationFfmpegArgs(inputPath: string, outputPath: string, filter: string, target: CalibrationTargetV1): string[] {
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
    'libx264',
    '-preset',
    target.preset,
    '-crf',
    String(target.crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function testAEquivalentToSourceAwarePreview(): boolean {
  return (
    BASE.reviewWidth === CALIBRATION_A.width &&
    BASE.reviewHeight === CALIBRATION_A.height &&
    BASE.crf === CALIBRATION_A.crf &&
    BASE.codec === 'libx264' &&
    BASE.pixelFormat === 'yuv420p' &&
    BASE.scaler === 'lanczos' &&
    BASE.preset === 'medium' &&
    BASE.fps === 30
  );
}

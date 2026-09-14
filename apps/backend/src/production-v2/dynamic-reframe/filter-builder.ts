import { DYNAMIC_PREVIEW_RENDER_CONFIG as C } from './render-config.js';
import { pixelCropFromNormalized } from './normalized-geometry.js';
import type { RuntimeShot } from './shot-split.js';

export function buildDynamicFilterGraph(input: {
  shots: readonly RuntimeShot[];
  sourceWidth: number;
  sourceHeight: number;
}): { filter: string; mapsForegroundBlur: false; usesLanczos: boolean } {
  const parts: string[] = [];
  const labels: string[] = [];
  input.shots.forEach((shot, index) => {
    const crop = pixelCropFromNormalized(shot.cropRectNormalized, input.sourceWidth, input.sourceHeight);
    const start = (shot.startMs / 1000).toFixed(3);
    const end = (shot.endMs / 1000).toFixed(3);
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,split=2[${fg}][${bg}]`);
    if (shot.fitMode === 'COVER') {
      parts.push(
        `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${C.reviewWidth}:${C.reviewHeight}[${fgc}]`,
      );
    } else {
      parts.push(
        `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2[${fgc}]`,
      );
    }
    parts.push(
      `[${bg}]scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${C.reviewWidth}:${C.reviewHeight},boxblur=${C.blurLuma}:${C.blurChroma},eq=brightness=${C.bgBrightness}[${bgb}]`,
    );
    parts.push(`[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${C.fps}[${out}]`);
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${input.shots.length}:v=1:a=0[outv]`);
  const filter = parts.join(';');
  return { filter, mapsForegroundBlur: false, usesLanczos: filter.includes('flags=lanczos') };
}

export function ffmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
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
    C.codec,
    '-preset',
    C.preset,
    '-crf',
    String(C.crf),
    '-pix_fmt',
    C.pixelFormat,
    outputPath,
  ];
}

export function filterBlursOnlyBackground(filter: string): boolean {
  const bgBlur = /\[bg\d+\][^[]*boxblur/.test(filter);
  const fgBlur = /\[fgc?\d+\][^[]*boxblur/.test(filter);
  return bgBlur && !fgBlur;
}

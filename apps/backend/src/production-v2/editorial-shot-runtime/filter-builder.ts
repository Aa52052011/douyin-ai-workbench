import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import type { EditorialShotV1 } from '../editorial-shot-director/types.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG as C } from './render-config.js';

function even(value: number): number {
  return value - (value % 2);
}

export function buildEditorialFilterGraph(input: {
  shots: readonly EditorialShotV1[];
  sourceWidth: number;
  sourceHeight: number;
}): { filter: string; usesLanczos: boolean; easedShots: number } {
  const parts: string[] = [];
  const labels: string[] = [];
  let easedShots = 0;
  input.shots.forEach((shot, index) => {
    const crop = pixelCropFromNormalized(shot.normalizedCrop, input.sourceWidth, input.sourceHeight);
    const start = (shot.sourceStartMs / 1000).toFixed(3);
    const end = (shot.sourceEndMs / 1000).toFixed(3);
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    const useBg = shot.backgroundTreatment !== 'OPTIONAL_NONE';
    if (shot.shotScale === 'DETAIL_READABLE' && shot.transitionIn === 'SHORT_EASED_ZOOM') {
      easedShots += 1;
    }

    if (useBg) {
      parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${C.fps},split=2[${fg}][${bg}]`);
      if (shot.fitMode === 'COVER') {
        const ow = even(Math.round(C.reviewWidth * (shot.shotScale === 'MEDIUM_FOCUS' ? C.mediumOverlay : 1)));
        const oh = even(Math.round(C.reviewHeight * (shot.shotScale === 'MEDIUM_FOCUS' ? C.mediumOverlay : 1)));
        parts.push(
          `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${ow}:${oh}:flags=${C.scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${ow}:${oh}[${fgc}]`,
        );
      } else {
        parts.push(
          `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2[${fgc}]`,
        );
      }
      const brightness = shot.shotScale === 'WIDE_CONTEXT' ? C.wideBgBrightness : C.mediumBgBrightness;
      parts.push(
        `[${bg}]scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${C.reviewWidth}:${C.reviewHeight},boxblur=${C.blurLuma}:${C.blurChroma},eq=brightness=${brightness}[${bgb}]`,
      );
      parts.push(
        `[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,fps=${C.fps},setpts=PTS-STARTPTS[${out}]`,
      );
    } else {
      parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${C.fps}[${fg}]`);
      parts.push(
        `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${C.reviewWidth}:${C.reviewHeight}:flags=${C.scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${C.reviewWidth}:${C.reviewHeight},setsar=1,fps=${C.fps},setpts=PTS-STARTPTS[${out}]`,
      );
    }
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${input.shots.length}:v=1:a=0[outv]`);
  const filter = parts.join(';');
  return { filter, usesLanczos: filter.includes('flags=lanczos'), easedShots };
}

export function editorialFfmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
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

export function editorialFilterBlursOnlyBackground(filter: string): boolean {
  const bgBlur = /\[bg\d+\][^[]*boxblur/.test(filter);
  const fgBlur = /\[fgc?\d+\][^[]*boxblur/.test(filter);
  return bgBlur && !fgBlur;
}

export function mechanicalEasedMotion(shots: readonly EditorialShotV1[]): boolean {
  const eased = shots.filter((item) => item.transitionIn === 'SHORT_EASED_ZOOM' || item.transitionIn === 'SHORT_EASED_PAN');
  if (eased.length > C.maxEasedShots) return true;
  if (eased.some((item) => item.sourceEndMs - item.sourceStartMs < 1000)) return true;
  return false;
}

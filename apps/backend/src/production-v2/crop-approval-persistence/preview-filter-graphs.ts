import { FROZEN_TOP_TRIM_CROP, REVIEW_PREVIEW_SIZE } from './preview-config.js';
import { containScale } from '../crop-execution/execution-plan-builder.js';

export function placeholderOrSolidFilterGraph(color: 'black' | '0x000000'): string {
  const crop = FROZEN_TOP_TRIM_CROP;
  const scaled = containScale(crop.width, crop.height, REVIEW_PREVIEW_SIZE.width, REVIEW_PREVIEW_SIZE.height);
  const padX = Math.floor((REVIEW_PREVIEW_SIZE.width - scaled.width) / 2);
  const padY = Math.floor((REVIEW_PREVIEW_SIZE.height - scaled.height) / 2);
  return [
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    `scale=${scaled.width}:${scaled.height}:force_original_aspect_ratio=disable`,
    `pad=${REVIEW_PREVIEW_SIZE.width}:${REVIEW_PREVIEW_SIZE.height}:${padX}:${padY}:${color}`,
    'setsar=1',
  ].join(',');
}

export function blurSourceFilterGraph(): string {
  const crop = FROZEN_TOP_TRIM_CROP;
  const scaled = containScale(crop.width, crop.height, REVIEW_PREVIEW_SIZE.width, REVIEW_PREVIEW_SIZE.height);
  const overlayX = Math.floor((REVIEW_PREVIEW_SIZE.width - scaled.width) / 2);
  const overlayY = Math.floor((REVIEW_PREVIEW_SIZE.height - scaled.height) / 2);
  return [
    `[0:v]split=2[fg][bg]`,
    `[fg]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${scaled.width}:${scaled.height}:force_original_aspect_ratio=disable[fgc]`,
    `[bg]scale=${REVIEW_PREVIEW_SIZE.width}:${REVIEW_PREVIEW_SIZE.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${REVIEW_PREVIEW_SIZE.width}:${REVIEW_PREVIEW_SIZE.height},boxblur=20:20[bgb]`,
    `[bgb][fgc]overlay=${overlayX}:${overlayY},setsar=1`,
  ].join(';');
}

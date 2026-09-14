import { containScale } from '../crop-execution/execution-plan-builder.js';
import { buildCropExecutionFilterGraph } from '../crop-execution/ffmpeg-filter-builder.js';
import type { FFmpegCropExecutionPlanV1, PixelCropRect } from '../crop-execution/execution-plan.types.js';
import { CROP_PREVIEW_RENDER_PLAN_VERSION, type CropPreviewRenderPlanV1 } from './review-flow.types.js';

export const REVIEW_PREVIEW_TARGET = { width: 720 as const, height: 1280 as const, aspectRatio: '9:16' as const };
export const PREVIEW_DURATION_TOLERANCE_MS = 250;
export const SMOKE_PLACEHOLDER_BACKGROUND = 'SMOKE_PLACEHOLDER_SOLID_BLACK' as const;

export function retargetFrozenCropToReviewPreview(input: {
  frozenCrop: PixelCropRect;
  productionPreviewPlan: FFmpegCropExecutionPlanV1;
  sessionId: string;
  previewVersion: string;
  previewId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  expiresAt: string;
}): {
  filterGraph: string;
  scale: { width: number; height: number };
  pad: { width: number; height: number; x: number; y: number };
  crop: PixelCropRect;
  plan: CropPreviewRenderPlanV1;
} {
  const crop = { ...input.frozenCrop };
  if (
    crop.width !== 1920 ||
    crop.height !== 930 ||
    crop.x !== 0 ||
    crop.y !== 110
  ) {
    throw new Error('FROZEN_CROP_MUTATION_FORBIDDEN');
  }
  const scaled = containScale(crop.width, crop.height, REVIEW_PREVIEW_TARGET.width, REVIEW_PREVIEW_TARGET.height);
  const padX = Math.floor((REVIEW_PREVIEW_TARGET.width - scaled.width) / 2);
  const padY = Math.floor((REVIEW_PREVIEW_TARGET.height - scaled.height) / 2);
  const draft: FFmpegCropExecutionPlanV1 = {
    ...input.productionPreviewPlan,
    crop,
    scale: { width: scaled.width, height: scaled.height, mode: 'UNIFORM' },
    pad: {
      enabled: true,
      width: REVIEW_PREVIEW_TARGET.width,
      height: REVIEW_PREVIEW_TARGET.height,
      x: padX,
      y: padY,
      backgroundTreatment: 'UNRESOLVED',
    },
    ffmpegFilterGraph: '',
  };
  const filterGraph = buildCropExecutionFilterGraph(draft);
  const outputRef = `review-preview/${input.sessionId}/${input.previewVersion}.mp4`;
  return {
    filterGraph,
    scale: scaled,
    pad: { width: REVIEW_PREVIEW_TARGET.width, height: REVIEW_PREVIEW_TARGET.height, x: padX, y: padY },
    crop,
    plan: {
      schemaVersion: CROP_PREVIEW_RENDER_PLAN_VERSION,
      mode: 'PREVIEW_REVIEW_ONLY',
      previewId: input.previewId,
      previewVersion: input.previewVersion,
      assetId: input.assetId,
      candidateId: input.candidateId,
      candidateVersion: input.candidateVersion,
      geometry: { crop, scale: scaled, pad: { x: padX, y: padY, width: REVIEW_PREVIEW_TARGET.width, height: REVIEW_PREVIEW_TARGET.height } },
      target: REVIEW_PREVIEW_TARGET,
      backgroundTreatment: 'UNRESOLVED',
      audioPolicy: 'MUTE_SOURCE_AUDIO',
      previewQuality: 'REVIEW_720p',
      watermarkOrMarker: 'REVIEW PREVIEW',
      outputRef,
      expiresAt: input.expiresAt,
      productionUsable: false,
      previewOnly: true,
      productionExecutionAllowed: false,
      ffmpegPreviewCalls: 0,
    },
  };
}

export function buildMutedPreviewFfmpegArgs(input: {
  inputPath: string;
  outputPath: string;
  filterGraph: string;
}): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-n',
    '-i',
    input.inputPath,
    '-vf',
    input.filterGraph,
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    input.outputPath,
  ];
}

export function parseVideoOnlyFfprobe(raw: string): {
  durationMs: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
} | null {
  try {
    const parsed = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
    };
    const durationSec = Number(parsed.format?.duration);
    const video = parsed.streams?.find((item) => item.codec_type === 'video');
    const audio = parsed.streams?.find((item) => item.codec_type === 'audio');
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !video?.width || !video.height) return null;
    return {
      durationMs: Math.round(durationSec * 1000),
      width: video.width,
      height: video.height,
      hasVideo: true,
      hasAudio: Boolean(audio),
      videoCodec: video.codec_name,
    };
  } catch {
    return null;
  }
}

export function durationWithinTolerance(sourceMs: number, previewMs: number, toleranceMs = PREVIEW_DURATION_TOLERANCE_MS): boolean {
  return Math.abs(previewMs - sourceMs) <= toleranceMs;
}

export function outputIsIsolated(outputPath: string, inputPath: string): boolean {
  const lower = outputPath.replaceAll('\\', '/').toLowerCase();
  if (outputPath === inputPath) return false;
  if (lower.includes('/final/') || lower.includes('/published/') || lower.endsWith('/production/') || lower.includes('/ready/')) {
    return false;
  }
  return lower.includes('/b2-13a/runtime-preview/') || lower.includes('/review-preview/');
}

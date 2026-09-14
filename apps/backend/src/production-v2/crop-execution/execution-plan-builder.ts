import type { GeometryProfile } from '../visual-hybrid/hybrid.types.js';
import { toPixelRect } from '../visual-crop-candidate/rect-math.js';
import type { CropSelectionDryRunResultV1 } from '../director-visual-policy/policy.types.js';
import type { HumanApprovedCropDecisionV1 } from './human-approval.types.js';
import {
  FFMPEG_CROP_EXECUTION_PLAN_VERSION,
  type BackgroundTreatment,
  type ExecutionFitMode,
  type FFmpegCropExecutionPlanV1,
  type PixelCropRect,
} from './execution-plan.types.js';
import { alignEvenPixelCrop } from './pixel-align.js';
import { buildCropExecutionFilterGraph } from './ffmpeg-filter-builder.js';

export function evenFloor(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function containScale(srcW: number, srcH: number, targetW: number, targetH: number): { width: number; height: number } {
  const scale = Math.min(targetW / srcW, targetH / srcH);
  let width = evenFloor(srcW * scale);
  let height = evenFloor(srcH * scale);
  if (width < 2) width = 2;
  if (height < 2) height = 2;
  if (width > targetW) width = evenFloor(targetW);
  if (height > targetH) height = evenFloor(targetH);
  return { width, height };
}

export function buildPreviewExecutionPlan(input: {
  dryRun: CropSelectionDryRunResultV1;
  profile: GeometryProfile;
  backgroundTreatment?: BackgroundTreatment;
}): FFmpegCropExecutionPlanV1 {
  const option = input.dryRun.selectedOption;
  if (!option) {
    throw new Error('NO_SELECTED_OPTION_FOR_PREVIEW');
  }
  const profile = input.profile;
  const raw = toPixelRect(option.sourceRect, profile);
  const aligned = alignEvenPixelCrop(raw, profile.sourceWidth, profile.sourceHeight);
  const crop: PixelCropRect = aligned.rect;
  const fit: ExecutionFitMode = option.fitMode === 'CONTAIN' || option.padRequired ? 'CONTAIN_PAD' : 'CROP_SCALE';
  const scaled =
    fit === 'CONTAIN_PAD'
      ? containScale(crop.width, crop.height, profile.targetWidth, profile.targetHeight)
      : { width: profile.targetWidth, height: profile.targetHeight };
  const padEnabled = fit === 'CONTAIN_PAD' && (scaled.width !== profile.targetWidth || scaled.height !== profile.targetHeight);
  const treatment = input.backgroundTreatment ?? (padEnabled ? 'UNRESOLVED' : 'UNRESOLVED');
  const padX = Math.floor((profile.targetWidth - scaled.width) / 2);
  const padY = Math.floor((profile.targetHeight - scaled.height) / 2);
  const draft: FFmpegCropExecutionPlanV1 = {
    schemaVersion: FFMPEG_CROP_EXECUTION_PLAN_VERSION,
    mode: 'PREVIEW_ONLY',
    assetId: input.dryRun.assetId,
    inputPathRef: `asset:${input.dryRun.assetId}`,
    outputPathRef: `derived:${input.dryRun.assetId}/ffmpeg-crop-plan-v1.mp4`,
    approvedDecisionRef: null,
    source: { width: profile.sourceWidth, height: profile.sourceHeight, fps: 'PRESERVE_SOURCE' },
    crop,
    scale: { width: scaled.width, height: scaled.height, mode: 'UNIFORM' },
    pad: padEnabled
      ? {
          enabled: true,
          width: profile.targetWidth,
          height: profile.targetHeight,
          x: padX,
          y: padY,
          backgroundTreatment: treatment,
        }
      : undefined,
    target: { width: 1080, height: 1920, aspectRatio: '9:16' },
    executionFitMode: fit,
    audioPolicy: 'MUTE_SOURCE_AUDIO',
    pixelFormat: 'yuv420p',
    codecPolicy: 'libx264',
    fpsPolicy: 'PRESERVE_SOURCE',
    durationPreserved: true,
    trim: 'NONE',
    split: false,
    dynamicReframe: false,
    ffmpegFilterGraph: '',
    pixelAlignmentAdjustment: aligned.adjusted,
    executionAuthorized: false,
    productionExecutionAllowed: false,
    ffmpegExecuted: false,
    outputFileCreated: false,
    provenance: { candidateId: option.candidateId, ruleIds: ['PLAN_FROM_IMMUTABLE_CANDIDATE', 'PREVIEW_NOT_AUTHORIZATION'] },
  };
  draft.ffmpegFilterGraph = buildCropExecutionFilterGraph(draft);
  return draft;
}

export function buildAuthorizedExecutionPlan(input: {
  dryRun: CropSelectionDryRunResultV1;
  profile: GeometryProfile;
  approval: HumanApprovedCropDecisionV1;
  backgroundTreatment: BackgroundTreatment;
}): FFmpegCropExecutionPlanV1 {
  const preview = buildPreviewExecutionPlan({
    dryRun: input.dryRun,
    profile: input.profile,
    backgroundTreatment: input.backgroundTreatment,
  });
  return {
    ...preview,
    mode: 'AUTHORIZED',
    approvedDecisionRef: `${input.approval.decisionVersion}:${input.approval.approvedCandidateId}`,
    pad: preview.pad ? { ...preview.pad, backgroundTreatment: input.backgroundTreatment } : undefined,
    executionAuthorized: true,
    productionExecutionAllowed: true,
    provenance: {
      ...preview.provenance,
      ruleIds: [...preview.provenance.ruleIds, 'AUTHORIZED_REQUIRES_HUMAN_APPROVAL'],
    },
  };
}

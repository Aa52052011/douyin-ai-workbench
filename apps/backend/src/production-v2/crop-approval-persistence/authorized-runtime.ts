import type { FFmpegCropExecutionPlanV1 } from '../crop-execution/execution-plan.types.js';
import { FFMPEG_CROP_EXECUTION_PLAN_VERSION } from '../crop-execution/execution-plan.types.js';
import { CROP_AUTHORIZED_RUNTIME_VERSION } from './persistence.types.js';
import { AUTHORIZED_BACKGROUNDS } from './persistence.types.js';

export type ProductionCropExecutionResultV1 = {
  schemaVersion: typeof CROP_AUTHORIZED_RUNTIME_VERSION;
  accepted: boolean;
  code: string;
  ffmpegSpawned: false;
  cropExecutionCompleted: false;
  videoFinalApproved: false;
  publishApproved: false;
};

export function assertProductionOutputPath(outputRef: string, inputRef: string): string[] {
  const errors: string[] = [];
  if (outputRef === inputRef) errors.push('SOURCE_OVERWRITE');
  const lower = outputRef.replaceAll('\\', '/').toLowerCase();
  if (lower.includes('review-preview')) errors.push('PREVIEW_DIR_NOT_PRODUCTION');
  if (!lower.includes('production-derived')) errors.push('OUTPUT_NOT_PRODUCTION_DERIVED');
  return errors;
}

export function validateAuthorizedProductionPlan(plan: FFmpegCropExecutionPlanV1): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (plan.mode !== 'AUTHORIZED') errors.push('PLAN_NOT_AUTHORIZED');
  if (plan.target.width !== 1080 || plan.target.height !== 1920) errors.push('INVALID_PRODUCTION_TARGET');
  if (plan.audioPolicy !== 'MUTE_SOURCE_AUDIO') errors.push('INVALID_AUDIO_POLICY');
  if (!plan.executionAuthorized || !plan.productionExecutionAllowed) errors.push('PLAN_NOT_PRODUCTION_ALLOWED');
  if (plan.crop && (plan.crop.width !== 1920 || plan.crop.height !== 930 || plan.crop.x !== 0 || plan.crop.y !== 110)) {
    errors.push('GEOMETRY_NOT_FROZEN_TOP_TRIM');
  }
  if (plan.pad?.enabled && plan.pad.backgroundTreatment === 'UNRESOLVED') errors.push('UNRESOLVED_BACKGROUND');
  if (plan.pad?.backgroundTreatment && !(AUTHORIZED_BACKGROUNDS as readonly string[]).includes(plan.pad.backgroundTreatment)) {
    errors.push('BACKGROUND_NOT_SUPPORTED');
  }
  errors.push(...assertProductionOutputPath(plan.outputPathRef, plan.inputPathRef));
  return { ok: errors.length === 0, errors };
}

export function executeAuthorizedCropPlan(plan: FFmpegCropExecutionPlanV1): ProductionCropExecutionResultV1 {
  if (plan.mode === 'PREVIEW_ONLY') {
    return {
      schemaVersion: CROP_AUTHORIZED_RUNTIME_VERSION,
      accepted: false,
      code: 'PREVIEW_ONLY_NOT_EXECUTABLE',
      ffmpegSpawned: false,
      cropExecutionCompleted: false,
      videoFinalApproved: false,
      publishApproved: false,
    };
  }
  const validated = validateAuthorizedProductionPlan(plan);
  if (!validated.ok) {
    return {
      schemaVersion: CROP_AUTHORIZED_RUNTIME_VERSION,
      accepted: false,
      code: validated.errors[0] ?? 'PLAN_INVALID',
      ffmpegSpawned: false,
      cropExecutionCompleted: false,
      videoFinalApproved: false,
      publishApproved: false,
    };
  }
  return {
    schemaVersion: CROP_AUTHORIZED_RUNTIME_VERSION,
    accepted: true,
    code: 'ACCEPTED_NO_SPAWN',
    ffmpegSpawned: false,
    cropExecutionCompleted: false,
    videoFinalApproved: false,
    publishApproved: false,
  };
}

export function upgradePreviewPlanToAuthorized(
  preview: FFmpegCropExecutionPlanV1,
  approvalId: string,
  backgroundTreatment: (typeof AUTHORIZED_BACKGROUNDS)[number],
  assetId: string,
): FFmpegCropExecutionPlanV1 {
  return {
    ...preview,
    schemaVersion: FFMPEG_CROP_EXECUTION_PLAN_VERSION,
    mode: 'AUTHORIZED',
    approvedDecisionRef: approvalId,
    outputPathRef: `production-derived:${assetId}/ffmpeg-crop-authorized-v1.mp4`,
    pad: preview.pad ? { ...preview.pad, backgroundTreatment } : undefined,
    executionAuthorized: true,
    productionExecutionAllowed: true,
    ffmpegExecuted: false,
    outputFileCreated: false,
    target: { width: 1080, height: 1920, aspectRatio: '9:16' },
  };
}

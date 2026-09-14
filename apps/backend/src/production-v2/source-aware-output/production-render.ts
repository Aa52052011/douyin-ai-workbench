import { createHash } from 'node:crypto';
import path from 'node:path';
import { pixelCropFromNormalized } from '../dynamic-reframe/normalized-geometry.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as PREVIEW } from '../source-aware-preview/render-config.js';
import type { RuntimeTimelineSegmentV1 } from '../source-aware-editorial/timeline.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from './dual-output.js';
import {
  VISUAL_PLAN_VERSION,
  assertFrozenB215JHashes,
  assertTruthRestrictionsUnchanged,
  authorizationIdentityFromPlan,
  identityFromPlan,
  matchApprovalToIdentity,
  matchAuthorizationToIdentity,
  type HumanVisualApprovalV1,
  type ProductionAuthorizationV1,
} from './visual-approval.js';
import {
  CALIBRATION_ARTIFACT_NAMES,
  FINAL_TRUTH_GATE_VERSION,
  isCalibrationArtifactPath,
  productionUsableAfterGates,
  type DualProfileProductionExecutionPlanV1,
  type ProductionArtifactV1,
} from './final-readiness.js';
import { buildLandscapeCalibrationFilter, landscapeFfmpegArgs } from './profiles.js';

export const PRODUCTION_EXECUTION_RUN_VERSION = 'production.execution-run:v1' as const;
export const PRODUCTION_AUTHORIZATION_CONSUMPTION_VERSION = 'production.authorization-consumption:v1' as const;
export const FROZEN_VISUAL_APPROVAL_ID = '2f6ed1e4-40f1-4376-9c47-44c2a457e5e0';
export const FROZEN_PRODUCTION_AUTHORIZATION_ID = '0ef97db0-e070-4c6f-bd2a-6a9e34fbfdcc';
export const FROZEN_EXECUTION_PLAN_ID = 'ae3ddafb-0642-47d7-ae2d-9acc3e712035';
export const FROZEN_EXECUTION_PREPARATION_ID = '3a857e2e-3c36-4ae1-bed9-036bc1a47723';
export const FROZEN_SOURCE_ASSET_ID = '803fafd2-4c0e-4412-80d7-a0d6452cefac';

export const VERTICAL_PRODUCTION_ENCODE = {
  width: 1080,
  height: 1920,
  crf: 18,
  preset: 'medium' as const,
  scaler: 'lanczos',
  fps: 30,
  pixelFormat: 'yuv420p' as const,
  codec: 'libx264' as const,
};

export type ProductionExecutionRunStatusV1 = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type ProductionExecutionRunV1 = {
  schemaVersion: typeof PRODUCTION_EXECUTION_RUN_VERSION;
  executionRunId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  profileId: string;
  status: ProductionExecutionRunStatusV1;
  inputRef: string;
  outputRef: string | null;
  startedAt: string | null;
  completedAt: string | null;
  configHash: string;
  sourceAssetId: string;
  visualApprovalId: string;
  productionAuthorizationId: string;
  productionPlanId: string;
  truthGateRef: typeof FINAL_TRUTH_GATE_VERSION;
  restrictedClaims: Array<'C5' | 'C6'>;
  ffmpegCalls: number;
  ffmpegExit: number | null;
  failureCode: string | null;
};

export type AuthorizationConsumptionV1 = {
  schemaVersion: typeof PRODUCTION_AUTHORIZATION_CONSUMPTION_VERSION;
  authorizationId: string;
  tenantId: string;
  reviewSessionId: string;
  productionPlanId: string;
  coversProfileIds: string[];
  rule: 'ONE_AUTHORIZATION_COVERS_DUAL_PLAN_BOTH_PROFILES';
  status: 'NOT_CONSUMED' | 'CONSUMED_FOR_DUAL_PLAN';
  verticalRunId: string | null;
  landscapeRunId: string | null;
  consumedAt: string | null;
};

export type ProbeSummaryV1 = {
  hasVideo: boolean;
  hasAudio: boolean;
  codec: string | null;
  width: number | null;
  height: number | null;
  pix_fmt: string | null;
  fps: number;
  durationSec: number;
  bytes: number;
};

export function assertProductionSourcePath(filePath: string): void {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (isPreviewOfPreviewPath(filePath)) throw new Error('PREVIEW_AS_PRODUCTION_SOURCE');
  if (isCalibrationArtifactPath(filePath)) throw new Error('CALIBRATION_AS_PRODUCTION_SOURCE');
  for (const name of CALIBRATION_ARTIFACT_NAMES) {
    if (lower.endsWith(`/${name.toLowerCase()}`)) throw new Error('CALIBRATION_AS_PRODUCTION_SOURCE');
  }
  const forbidden = [
    '/review-preview/',
    '/crop-review-previews/',
    '/source-aware-previews/',
    '/editorial-shot-previews/',
    '/dynamic-reframe-previews/',
    '/dynamic-reframe-preview/',
    '/mobile-aspect-calibration/',
    '/mobile-quality-calibration/',
    '/mobile-review/',
    '/production-artifacts/',
    '/b2-13a/runtime-preview/',
  ];
  if (forbidden.some((item) => lower.includes(item))) throw new Error('FORBIDDEN_PRODUCTION_SOURCE_PATH');
}

export function productionArtifactFileName(profileId: string): string {
  if (profileId === VERTICAL_PROFILE_ID) return 'vertical.douyin.v1.mp4';
  if (profileId === LANDSCAPE_PROFILE_ID) return 'landscape.ui-demo.v1.mp4';
  throw new Error('UNKNOWN_PRODUCTION_PROFILE');
}

export function assertLiveProductionBindings(input: {
  plan: DualProfileProductionExecutionPlanV1;
  approval: HumanVisualApprovalV1;
  authorization: ProductionAuthorizationV1;
}): void {
  const { plan, approval, authorization } = input;
  if (plan.outputStrategy !== 'DUAL_VERTICAL_AND_LANDSCAPE') throw new Error('STOP_STRATEGY_NOT_DUAL');
  if (plan.sourceAssetId !== approval.sourceAssetId || plan.sourceAssetId !== authorization.sourceAssetId) {
    throw new Error('STOP_SOURCE_BINDING_MISMATCH');
  }
  if (plan.visualApprovalId !== approval.approvalId) throw new Error('STOP_PLAN_APPROVAL_REF');
  if (plan.productionAuthorizationId !== authorization.authorizationId) throw new Error('STOP_PLAN_AUTHORIZATION_REF');
  const identity = identityFromPlan(plan);
  assertFrozenB215JHashes(identity);
  assertTruthRestrictionsUnchanged(plan.restrictedClaims);
  assertTruthRestrictionsUnchanged(approval.restrictedClaims);
  assertTruthRestrictionsUnchanged(authorization.restrictedClaims);
  if (matchApprovalToIdentity(approval, identity) !== 'MATCH') throw new Error('VISUAL_APPROVAL_STALE');
  if (matchAuthorizationToIdentity(authorization, authorizationIdentityFromPlan(plan, approval.approvalId)) !== 'MATCH') {
    throw new Error('PRODUCTION_AUTHORIZATION_STALE');
  }
}

export function assertFrozenProductionBindings(input: {
  plan: DualProfileProductionExecutionPlanV1;
  approval: HumanVisualApprovalV1;
  authorization: ProductionAuthorizationV1;
}): void {
  assertLiveProductionBindings(input);
  const { plan, approval, authorization } = input;
  if (plan.planId !== FROZEN_EXECUTION_PLAN_ID) throw new Error('STOP_PLAN_ID_CHANGED');
  if (plan.sourceAssetId !== FROZEN_SOURCE_ASSET_ID) throw new Error('STOP_SOURCE_CHANGED');
  if (plan.executionPreparationId !== FROZEN_EXECUTION_PREPARATION_ID) throw new Error('STOP_PREPARATION_ID_CHANGED');
  if (approval.approvalId !== FROZEN_VISUAL_APPROVAL_ID) throw new Error('STOP_APPROVAL_ID_CHANGED');
  if (authorization.authorizationId !== FROZEN_PRODUCTION_AUTHORIZATION_ID) throw new Error('STOP_AUTHORIZATION_ID_CHANGED');
  if (approval.visualPlanRef !== VISUAL_PLAN_VERSION) throw new Error('STOP_VISUAL_PLAN_CHANGED');
  if (plan.truthGateRef !== FINAL_TRUTH_GATE_VERSION) throw new Error('STOP_TRUTH_GATE_REF');
}

export function buildVerticalProductionFilterGraph(input: {
  segments: readonly RuntimeTimelineSegmentV1[];
  sourceWidth: number;
  sourceHeight: number;
}): { filter: string; usesLanczos: true } {
  const parts: string[] = [];
  const labels: string[] = [];
  const { width, height, scaler, fps } = VERTICAL_PRODUCTION_ENCODE;
  input.segments.forEach((segment, index) => {
    const crop = pixelCropFromNormalized(segment.normalizedCrop, input.sourceWidth, input.sourceHeight);
    const start = (segment.sourceStartMs / 1000).toFixed(3);
    const end = (segment.sourceEndMs / 1000).toFixed(3);
    const fg = `fg${index}`;
    const bg = `bg${index}`;
    const fgc = `fgc${index}`;
    const bgb = `bgb${index}`;
    const out = `v${index}`;
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${fps},split=2[${fg}][${bg}]`);
    parts.push(
      `[${fg}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=decrease:force_divisible_by=2[${fgc}]`,
    );
    parts.push(
      `[${bg}]scale=${width}:${height}:flags=${scaler}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=${PREVIEW.blurLuma}:${PREVIEW.blurChroma},eq=brightness=${PREVIEW.wideBgBrightness}[${bgb}]`,
    );
    parts.push(
      `[${bgb}][${fgc}]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:repeatlast=1,setsar=1,fps=${fps},setpts=PTS-STARTPTS[${out}]`,
    );
    labels.push(`[${out}]`);
  });
  parts.push(`${labels.join('')}concat=n=${input.segments.length}:v=1:a=0[outv]`);
  return { filter: parts.join(';'), usesLanczos: true };
}

export function buildLandscapeProductionFilter(sourceEndSec: number): { filter: string; stretch: false } {
  return buildLandscapeCalibrationFilter(sourceEndSec);
}

export function verticalProductionFfmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
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
    String(VERTICAL_PRODUCTION_ENCODE.crf),
    '-pix_fmt',
    VERTICAL_PRODUCTION_ENCODE.pixelFormat,
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function landscapeProductionFfmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
  return landscapeFfmpegArgs(inputPath, outputPath, filter);
}

export function validateProductionProbe(input: {
  profileId: string;
  probe: ProbeSummaryV1;
  expectedDurationMs: number;
  decodeOk: boolean;
}): { ok: boolean; code: string | null } {
  const vertical = input.profileId === VERTICAL_PROFILE_ID;
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  if (!input.probe.hasVideo) return { ok: false, code: 'PROBE_NO_VIDEO' };
  if (input.probe.hasAudio) return { ok: false, code: 'PROBE_UNEXPECTED_AUDIO' };
  if (input.probe.codec !== 'h264') return { ok: false, code: 'PROBE_CODEC' };
  if (input.probe.width !== width || input.probe.height !== height) return { ok: false, code: 'PROBE_RESOLUTION' };
  if (input.probe.pix_fmt !== 'yuv420p') return { ok: false, code: 'PROBE_PIX_FMT' };
  if (!(input.probe.fps >= 29.5 && input.probe.fps <= 30.5)) return { ok: false, code: 'PROBE_FPS' };
  if (!Number.isFinite(input.probe.durationSec) || input.probe.durationSec < 0.2) return { ok: false, code: 'PROBE_DURATION' };
  const durationMs = input.probe.durationSec * 1000;
  if (Math.abs(durationMs - input.expectedDurationMs) > 2500) return { ok: false, code: 'PROBE_DURATION' };
  if (input.probe.bytes < 10_000) return { ok: false, code: 'PROBE_BYTES' };
  if (!input.decodeOk) return { ok: false, code: 'DECODE_FAILED' };
  return { ok: true, code: null };
}

export function decideProductionUsable(input: {
  renderSuccess: boolean;
  artifactValid: boolean;
  probeOk: boolean;
  decodeOk: boolean;
  truthAcceptable: boolean;
  bindingsMatch: boolean;
  visualApproved: boolean;
  productionAuthorized: boolean;
}): boolean {
  return (
    productionUsableAfterGates({
      visualApproved: input.visualApproved,
      truthAcceptable: input.truthAcceptable,
      productionAuthorized: input.productionAuthorized,
      renderSuccess: input.renderSuccess,
      artifactValidated: input.artifactValid && input.probeOk && input.decodeOk,
    }) && input.bindingsMatch
  );
}

export function consumeAuthorizationAfterDualRuns(input: {
  authorizationId: string;
  tenantId: string;
  reviewSessionId: string;
  productionPlanId: string;
  vertical: ProductionExecutionRunV1;
  landscape: ProductionExecutionRunV1;
}): AuthorizationConsumptionV1 {
  const terminal = (status: ProductionExecutionRunStatusV1) => status === 'COMPLETED' || status === 'FAILED';
  const bothDone = terminal(input.vertical.status) && terminal(input.landscape.status);
  return {
    schemaVersion: PRODUCTION_AUTHORIZATION_CONSUMPTION_VERSION,
    authorizationId: input.authorizationId,
    tenantId: input.tenantId,
    reviewSessionId: input.reviewSessionId,
    productionPlanId: input.productionPlanId,
    coversProfileIds: [VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID],
    rule: 'ONE_AUTHORIZATION_COVERS_DUAL_PLAN_BOTH_PROFILES',
    status: bothDone ? 'CONSUMED_FOR_DUAL_PLAN' : 'NOT_CONSUMED',
    verticalRunId: input.vertical.executionRunId,
    landscapeRunId: input.landscape.executionRunId,
    consumedAt: bothDone ? new Date().toISOString() : null,
  };
}

export function planStatusAfterRuns(vertical: ProductionExecutionRunStatusV1, landscape: ProductionExecutionRunStatusV1) {
  if (vertical === 'COMPLETED' && landscape === 'COMPLETED') return 'PRODUCTION_COMPLETED' as const;
  if (vertical === 'FAILED' && landscape === 'FAILED') return 'BLOCKED' as const;
  if (vertical === 'COMPLETED' || landscape === 'COMPLETED') return 'PRODUCTION_PARTIAL' as const;
  return 'BLOCKED' as const;
}

export function artifactStorageKey(input: { tenantId: string; reviewSessionId: string; profileId: string }): string {
  return path.posix.join(
    'production-artifacts',
    input.tenantId,
    input.reviewSessionId,
    productionArtifactFileName(input.profileId),
  );
}

export function runConfigHash(input: { profileId: string; configHash: string; sourcePath: string; sourceSize: number }): string {
  return createHash('sha256')
    .update(JSON.stringify({ profileId: input.profileId, configHash: input.configHash, sourceSize: input.sourceSize }))
    .digest('hex');
}

export function buildPersistedArtifact(input: {
  artifactId: string;
  run: ProductionExecutionRunV1;
  probe: ProbeSummaryV1;
  productionUsable: boolean;
}): ProductionArtifactV1 {
  return {
    schemaVersion: 'production.artifact:v1',
    artifactId: input.artifactId,
    profileId: input.run.profileId,
    sourceAssetId: input.run.sourceAssetId,
    productionPlanId: input.run.productionPlanId,
    executionRunId: input.run.executionRunId,
    configHash: input.run.configHash,
    resolution: `${input.probe.width}x${input.probe.height}`,
    codec: 'H.264',
    fps: input.probe.fps,
    pixelFormat: 'yuv420p',
    duration: input.probe.durationSec,
    durationMs: Math.round(input.probe.durationSec * 1000),
    bytes: input.probe.bytes,
    productionUsable: input.productionUsable,
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: ['C5', 'C6'],
    visualApprovalRef: input.run.visualApprovalId,
    authorizationRef: input.run.productionAuthorizationId,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL',
    createdAt: new Date().toISOString(),
  };
}

import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from './dual-output.js';
import { isCalibrationArtifactPath, type ProductionArtifactV1 } from './final-readiness.js';
import { productionArtifactFileName } from './production-render.js';

export const FINAL_PRODUCTION_REVIEW_VERSION = 'final.production-review:v1' as const;
export const FINAL_PRODUCTION_ACCEPTANCE_VERSION = 'final.production-acceptance:v1' as const;
export const FINAL_DELIVERY_PACKAGE_VERSION = 'final.delivery-package:v1' as const;

export const FROZEN_VERTICAL_ARTIFACT_ID = 'e1b03315-7cba-441d-9bbd-4f96d57f44f5';
export const FROZEN_LANDSCAPE_ARTIFACT_ID = '693843ed-5b6b-4072-9e49-d5544b5f0e32';

export const VERTICAL_DELIVERY_FILE = 'Content-01_Douyin_Vertical_1080x1920.mp4';
export const LANDSCAPE_DELIVERY_FILE = 'Content-01_UI-Landscape_1920x1080.mp4';

export const FINAL_HUMAN_DECISIONS = ['PENDING', 'ACCEPTED', 'REQUEST_CHANGES', 'REJECTED'] as const;
export type FinalHumanDecisionV1 = (typeof FINAL_HUMAN_DECISIONS)[number];

export const VERTICAL_FINAL_CHECKLIST = [
  'VERTICAL_FILE_PLAYS',
  'VERTICAL_RESOLUTION_CORRECT',
  'VERTICAL_TEXT_SHARPNESS_ACCEPTABLE',
  'VERTICAL_WHOLE_UI_COMPOSITION_ACCEPTABLE',
  'VERTICAL_PHONE_PORTRAIT_EXPERIENCE_ACCEPTABLE',
  'VERTICAL_NO_VISUAL_CORRUPTION',
] as const;

export const LANDSCAPE_FINAL_CHECKLIST = [
  'LANDSCAPE_FILE_PLAYS',
  'LANDSCAPE_RESOLUTION_CORRECT',
  'LANDSCAPE_TEXT_SHARPNESS_ACCEPTABLE',
  'LANDSCAPE_WHOLE_UI_INTEGRITY_ACCEPTABLE',
  'LANDSCAPE_PHONE_LANDSCAPE_FULLSCREEN_ACCEPTABLE',
  'LANDSCAPE_NO_STRETCH',
  'LANDSCAPE_NO_VISUAL_CORRUPTION',
] as const;

export const SHARED_FINAL_CHECKLIST = [
  'DURATION_ACCEPTABLE',
  'NO_BLANK_GAP',
  'NO_BROKEN_TEXT_OR_CONTAINER',
  'TRUTH_BOUNDARY_PRESERVED',
  'C5_RESTRICTION_PRESERVED',
  'C6_RESTRICTION_PRESERVED',
  'PRODUCTION_ARTIFACT_IDENTITY_VERIFIED',
] as const;

export const SYSTEM_CHECKLIST_IDS = new Set([
  'VERTICAL_FILE_PLAYS',
  'VERTICAL_RESOLUTION_CORRECT',
  'LANDSCAPE_FILE_PLAYS',
  'LANDSCAPE_RESOLUTION_CORRECT',
  'PRODUCTION_ARTIFACT_IDENTITY_VERIFIED',
  'TRUTH_BOUNDARY_PRESERVED',
  'C5_RESTRICTION_PRESERVED',
  'C6_RESTRICTION_PRESERVED',
]);

export type FinalChecklistItemV1 = {
  id: string;
  kind: 'SYSTEM' | 'HUMAN';
  result: 'PASS' | 'PENDING' | 'FAIL';
};

export type FinalReviewArtifactRefV1 = {
  artifactId: string;
  profileId: string;
  fileRef: string;
  configHash: string;
  sha256: string;
  resolution: string;
  productionUsable: boolean;
  durationMs: number | null;
  bytes: number;
};

export type FinalProductionReviewV1 = {
  schemaVersion: typeof FINAL_PRODUCTION_REVIEW_VERSION;
  reviewId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  strategy: 'DUAL_VERTICAL_AND_LANDSCAPE';
  artifacts: FinalReviewArtifactRefV1[];
  checklist: FinalChecklistItemV1[];
  humanDecision: FinalHumanDecisionV1;
  createdAt: string;
  updatedAt: string;
  feedback?: string;
};

export type FinalProductionAcceptanceV1 = {
  acceptanceId: string;
  finalReviewId: string;
  productionPlanId: string;
  artifactIds: string[];
  decision: FinalHumanDecisionV1;
  source: 'EXPLICIT_USER_MESSAGE' | 'USER_UI_FINAL_REVIEW_ACTION';
  feedback?: string;
  createdAt: string;
  immutable: true;
};

export function finalProductionAcceptanceContract(): {
  schemaVersion: typeof FINAL_PRODUCTION_ACCEPTANCE_VERSION;
  requiredFields: string[];
  object: null;
  autoCreateForbidden: true;
  packagingDoesNotAccept: true;
} {
  return {
    schemaVersion: FINAL_PRODUCTION_ACCEPTANCE_VERSION,
    requiredFields: [
      'acceptanceId',
      'finalReviewId',
      'productionPlanId',
      'artifactIds',
      'decision',
      'source',
      'createdAt',
      'immutable',
    ],
    object: null,
    autoCreateForbidden: true,
    packagingDoesNotAccept: true,
  };
}

export function assertFinalReviewSourcePath(filePath: string): void {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (isPreviewOfPreviewPath(filePath)) throw new Error('PREVIEW_REJECTED_AS_FINAL');
  if (isCalibrationArtifactPath(filePath)) throw new Error('CALIBRATION_REJECTED_AS_FINAL');
  if (
    lower.includes('/mobile-aspect-calibration/') ||
    lower.includes('/mobile-quality-calibration/') ||
    lower.includes('/mobile-review/') ||
    lower.includes('/review-preview/') ||
    lower.includes('/source-aware-previews/')
  ) {
    throw new Error('NON_PRODUCTION_REJECTED_AS_FINAL');
  }
  if (!lower.includes('/production-artifacts/')) throw new Error('DELIVERY_SOURCE_MUST_BE_PRODUCTION_ARTIFACT');
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function hasMoovFaststart(filePath: string): boolean {
  const fd = readFileSync(filePath);
  const moov = fd.indexOf('moov');
  const mdat = fd.indexOf('mdat');
  if (moov < 0) return false;
  if (mdat < 0) return moov >= 0;
  return moov < mdat;
}

export function copyByteIdentical(sourcePath: string, destPath: string): { bytes: number } {
  assertFinalReviewSourcePath(sourcePath);
  copyFileSync(sourcePath, destPath);
  const src = statSync(sourcePath).size;
  const dest = statSync(destPath).size;
  if (src !== dest) throw new Error('DELIVERY_BYTE_MISMATCH');
  return { bytes: dest };
}

export function buildFinalChecklist(input: {
  verticalOk: boolean;
  landscapeOk: boolean;
  identityOk: boolean;
  truthOk: boolean;
}): FinalChecklistItemV1[] {
  const item = (id: string, systemPass: boolean): FinalChecklistItemV1 => ({
    id,
    kind: SYSTEM_CHECKLIST_IDS.has(id) ? 'SYSTEM' : 'HUMAN',
    result: SYSTEM_CHECKLIST_IDS.has(id) ? (systemPass ? 'PASS' : 'FAIL') : 'PENDING',
  });
  return [
    item('VERTICAL_FILE_PLAYS', input.verticalOk),
    item('VERTICAL_RESOLUTION_CORRECT', input.verticalOk),
    item('VERTICAL_TEXT_SHARPNESS_ACCEPTABLE', false),
    item('VERTICAL_WHOLE_UI_COMPOSITION_ACCEPTABLE', false),
    item('VERTICAL_PHONE_PORTRAIT_EXPERIENCE_ACCEPTABLE', false),
    item('VERTICAL_NO_VISUAL_CORRUPTION', false),
    item('LANDSCAPE_FILE_PLAYS', input.landscapeOk),
    item('LANDSCAPE_RESOLUTION_CORRECT', input.landscapeOk),
    item('LANDSCAPE_TEXT_SHARPNESS_ACCEPTABLE', false),
    item('LANDSCAPE_WHOLE_UI_INTEGRITY_ACCEPTABLE', false),
    item('LANDSCAPE_PHONE_LANDSCAPE_FULLSCREEN_ACCEPTABLE', false),
    item('LANDSCAPE_NO_STRETCH', false),
    item('LANDSCAPE_NO_VISUAL_CORRUPTION', false),
    item('DURATION_ACCEPTABLE', false),
    item('NO_BLANK_GAP', false),
    item('NO_BROKEN_TEXT_OR_CONTAINER', false),
    item('TRUTH_BOUNDARY_PRESERVED', input.truthOk),
    item('C5_RESTRICTION_PRESERVED', input.truthOk),
    item('C6_RESTRICTION_PRESERVED', input.truthOk),
    item('PRODUCTION_ARTIFACT_IDENTITY_VERIFIED', input.identityOk),
  ];
}

export function buildFinalProductionReview(input: {
  reviewId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  artifacts: FinalReviewArtifactRefV1[];
  checklist: FinalChecklistItemV1[];
}): FinalProductionReviewV1 {
  const now = new Date().toISOString();
  if (input.artifacts.some((item) => !item.productionUsable)) throw new Error('ARTIFACT_NOT_PRODUCTION_USABLE');
  if (input.artifacts.length !== 2) throw new Error('DUAL_ARTIFACTS_REQUIRED');
  return {
    schemaVersion: FINAL_PRODUCTION_REVIEW_VERSION,
    reviewId: input.reviewId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewSessionId: input.reviewSessionId,
    productionPlanId: input.productionPlanId,
    strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    artifacts: input.artifacts,
    checklist: input.checklist,
    humanDecision: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
}

export function deliveryReadme(): string {
  return [
    'Content-01 正式成片交付',
    '',
    '文件 1：Content-01_Douyin_Vertical_1080x1920.mp4',
    '竖屏版，1080×1920，适合手机竖屏信息流观看。',
    '',
    '文件 2：Content-01_UI-Landscape_1920x1080.mp4',
    '横屏版，1920×1080，适合手机横屏/全屏观看软件录屏。',
    '',
    '这两个文件都是正式成片，不是预览，也不是校准样片。',
    '请把文件拷到手机后：竖屏版用竖屏观看，横屏版用横屏或全屏观看。',
    '看完后告诉我：可以验收，或需要修改（请说明具体问题）。',
    '',
  ].join('\n');
}

export function buildDeliveryManifest(input: {
  productionPlanId: string;
  files: Array<{
    deliveryFile: string;
    artifactId: string;
    profileId: string;
    resolution: string;
    codec: string;
    fps: number;
    durationMs: number;
    bytes: number;
    sha256: string;
    productionUsable: boolean;
    directFromOriginal: true;
  }>;
}): Record<string, unknown> {
  return {
    packageVersion: FINAL_DELIVERY_PACKAGE_VERSION,
    contentId: 'content-01',
    productionPlanId: input.productionPlanId,
    outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    files: input.files,
    truthGate: 'PASS_WITH_RESTRICTIONS',
    restrictedClaims: ['C5', 'C6'],
    publicationReady: false,
    humanFinalAcceptance: 'PENDING',
    createdAt: new Date().toISOString(),
  };
}

export function buildFinalProductionReviewHttpView(review: FinalProductionReviewV1 | null) {
  if (!review) {
    return {
      status: 'NOT_READY' as const,
      humanDecision: 'PENDING' as const,
      acceptance: null,
      publication: 'NOT_STARTED' as const,
      badge: 'FINAL PRODUCTION',
      artifacts: [],
      checklist: [],
      media: {
        verticalUrl: null as string | null,
        landscapeUrl: null as string | null,
      },
    };
  }
  const vertical = review.artifacts.find((item) => item.profileId === VERTICAL_PROFILE_ID);
  const landscape = review.artifacts.find((item) => item.profileId === LANDSCAPE_PROFILE_ID);
  return {
    status: 'READY_FOR_HUMAN_REVIEW' as const,
    humanDecision: review.humanDecision,
    acceptance: null,
    publication: 'NOT_STARTED' as const,
    badge: 'FINAL PRODUCTION',
    reviewId: review.reviewId,
    productionPlanId: review.productionPlanId,
    artifacts: review.artifacts,
    checklist: review.checklist,
    vertical: vertical
      ? {
          artifactId: vertical.artifactId,
          profileId: vertical.profileId,
          resolution: vertical.resolution,
          productionUsable: vertical.productionUsable,
          durationMs: vertical.durationMs,
          kind: 'PRODUCTION' as const,
        }
      : null,
    landscape: landscape
      ? {
          artifactId: landscape.artifactId,
          profileId: landscape.profileId,
          resolution: landscape.resolution,
          productionUsable: landscape.productionUsable,
          durationMs: landscape.durationMs,
          kind: 'PRODUCTION' as const,
        }
      : null,
    media: {
      verticalUrl: `/production-v2/crop-review/${review.reviewSessionId}/final-production-media?profile=vertical`,
      landscapeUrl: `/production-v2/crop-review/${review.reviewSessionId}/final-production-media?profile=landscape`,
    },
  };
}

export function productionMediaPathForProfile(input: {
  repoRoot: string;
  tenantId: string;
  reviewSessionId: string;
  profile: 'vertical' | 'landscape';
}): string {
  const profileId = input.profile === 'vertical' ? VERTICAL_PROFILE_ID : LANDSCAPE_PROFILE_ID;
  return path.join(
    input.repoRoot,
    '.local',
    'production-artifacts',
    input.tenantId.replace(/[^a-zA-Z0-9._-]/g, '_'),
    input.reviewSessionId.replace(/[^a-zA-Z0-9._-]/g, '_'),
    productionArtifactFileName(profileId),
  );
}

export function expectedFrozenArtifactId(profileId: string): string {
  if (profileId === VERTICAL_PROFILE_ID) return FROZEN_VERTICAL_ARTIFACT_ID;
  if (profileId === LANDSCAPE_PROFILE_ID) return FROZEN_LANDSCAPE_ARTIFACT_ID;
  throw new Error('UNKNOWN_PROFILE');
}

export function applyExplicitRequestChanges(review: FinalProductionReviewV1, feedback: string): FinalProductionReviewV1 {
  if (review.humanDecision === 'ACCEPTED') throw new Error('CANNOT_OVERRIDE_ACCEPTED');
  const checklist = review.checklist.map((item) => {
    if (item.id === 'VERTICAL_TEXT_SHARPNESS_ACCEPTABLE' || item.id === 'VERTICAL_PHONE_PORTRAIT_EXPERIENCE_ACCEPTABLE') {
      return { ...item, result: 'FAIL' as const };
    }
    return item;
  });
  return {
    ...review,
    checklist,
    humanDecision: 'REQUEST_CHANGES',
    updatedAt: new Date().toISOString(),
    feedback,
  };
}

export { VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID };

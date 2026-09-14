import { createHash } from 'node:crypto';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { FROZEN_SCRIPT_ID, SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { FROZEN_PROJECT_ID } from './execution-manifest.js';
import {
  ACCEPTED_NARRATION_MS,
  SCRIPT_TIMELINE_AUTHORITY,
  decideBgm,
  scriptDrivenDurationMs,
} from './director-v1.js';
import { productionConstraintRegistry, missingCapabilityLedger, noQualityDowngradePolicy } from './production-constraints.js';
import { REJECTED_SECTION4_CANDIDATE, VISUAL_AUTHENTICITY_PRIORITY } from './visual-governance.js';
import { O2G_OPENING_ZOOMPAN_EXPR, OPENING_RANGE_MS, directorMotionBoundaryPolicy, motionBudgetPolicy } from './motion-stability.js';
import { FROZEN_PRODUCTION_AUTHORIZATION_ID } from '../source-aware-output/production-render.js';
import { FROZEN_LANDSCAPE_SHA, FROZEN_VERTICAL_SHA } from './capability-execution.js';

export const FINAL_PRODUCTION_SPEC_VERSION = 'final.production-specification:v2' as const;
export const FINAL_PRODUCTION_SPEC_ID = 'spec:content-01:final-production:v2' as const;
export const VERTICAL_PROFILE_V2_ID = 'production.vertical.douyin:v2' as const;
export const LANDSCAPE_PROFILE_V2_ID = 'production.landscape.ui-demo:v2' as const;
export const CALIBRATION_AS_PRODUCTION_SOURCE = 'FORBIDDEN' as const;
export const SPEC_CREATED_AT = '2026-09-12T20:10:00.000Z';

export type ReadinessStatusV1 =
  | 'READY'
  | 'READY_WITH_ACCEPTED_FALLBACK'
  | 'READY_FOR_FINAL_RENDER'
  | 'READY_WITH_ACCEPTED_CONTENT_VARIANT'
  | 'READY_WITH_RESTRICTIONS'
  | 'BLOCKED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'NOT_APPLICABLE';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function verticalProfileV2() {
  return {
    schemaVersion: 'production.output-profile:v2',
    profileId: VERTICAL_PROFILE_V2_ID,
    width: 1080,
    height: 1920,
    codec: 'libx264',
    pixelFormat: 'yuv420p',
    fps: 30,
    crf: 18,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
    fidelity: 'V2_LIGHT_SHARPEN_SELECTED',
    sharpen: SELECTED_V2_SHARPEN,
    applyV2To: 'ALL_APPLICABLE_SCREEN_RECORDING_UI_DEMO_SHOTS',
    productionUsable: false,
    supersedes: 'production.vertical.douyin:v1',
  };
}

export function landscapeProfileV2() {
  return {
    schemaVersion: 'production.output-profile:v2',
    profileId: LANDSCAPE_PROFILE_V2_ID,
    width: 1920,
    height: 1080,
    codec: 'libx264',
    pixelFormat: 'yuv420p',
    fps: 30,
    crf: 18,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
    framing: 'SOURCE_NATIVE_NO_STRETCH',
    scale: 'scale-to-fit',
    stretch: false,
    doNotApplyVerticalCropLogic: true,
    productionUsable: false,
    supersedes: 'production.landscape.ui-demo:v1',
  };
}

export function audioPolicyV2() {
  return {
    schemaVersion: 'audio.policy:v2',
    narrationAssetPolicy: 'HUMAN_ACCEPTED_FROZEN',
    narrationDurationMs: ACCEPTED_NARRATION_MS,
    regenerateTts: false,
    changeVoice: false,
    forceSpeedUp: false,
    deleteSentences: false,
    codec: 'aac',
    sampleRate: 48000,
    channels: 2,
    bitrateKbps: 160,
    integratedLufsTarget: -16,
    integratedLufsAcceptable: [-16, -14],
    truePeakSuggestedDbTp: -1.2,
    truePeakMaxDbTp: -1.0,
    sync: 'SEMANTIC_TIMELINE_ALIGNED',
    not: 'EXACT_FRAME_LIPSYNC',
  };
}

export function timelinePolicyV2() {
  return {
    authority: SCRIPT_TIMELINE_AUTHORITY,
    forbiddenAuthority: 'SOURCE_VIDEO_DURATION_IS_TIMELINE_AUTHORITY',
    scriptId: FROZEN_SCRIPT_ID,
    scriptStatus: 'IMMUTABLE',
    plannedDurationMs: scriptDrivenDurationMs(),
    allowedDurationMs: [45_000, 47_500],
    beatOrder: ['hook', 'opening', 'section1', 'section2', 'section3', 'section4', 'section5', 'ending_cta'],
    beatCount: 8,
  };
}

export function motionPolicyFinal() {
  return {
    ...directorMotionBoundaryPolicy(),
    opening: {
      rangeMs: OPENING_RANGE_MS,
      strategy: ['STATIC_HOLD', 'FIXED_CROP_CENTER', 'FIXED_SCALE'],
      fixedScale: 1.0,
      kenBurnsExpr: O2G_OPENING_ZOOMPAN_EXPR,
      kenBurns: 'FORBIDDEN',
      human: 'HUMAN_ACCEPTED',
    },
    budget: motionBudgetPolicy(),
  };
}

export function section4FinalPolicy() {
  return {
    human: 'HUMAN_ACCEPTED',
    strategy: 'USE_REAL_UI_WITH_MOTION',
    semanticGoal: 'EVIDENCE_OVER_PROMISE',
    rejectedAiImage: REJECTED_SECTION4_CANDIDATE,
    rejectedStatus: 'REJECTED_CALIBRATION_ARTIFACT',
    productionUsable: false,
    forbiddenFromProductionGraph: true,
  };
}

export function productVisualPolicyFinal() {
  return {
    policy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    human: 'HUMAN_ACCEPTED',
    priority: [...VISUAL_AUTHENTICITY_PRIORITY],
  };
}

export function bgmContentDecisionFinal() {
  const director = decideBgm({
    contentType: 'SCREEN_RECORDING_UI_DEMO',
    narrationDensity: 'HIGH',
    hasUserBgm: false,
    hasLicensedBgm: false,
    musicCapability: true,
  });
  return {
    content01Decision: director.decision,
    basis: 'DIRECTOR_CONTENT_DECISION_ALLOWING_NARRATION_ONLY',
    notBasis: 'MINIMAX_PROVIDER_FAILURE',
    narrationOnlyAllowedByDirector: true,
    notGlobalDefaultNoBgm: true,
    directorHasBgmAuthority: true,
    productCapability: 'PRESERVED',
    minimaxMusic: 'BLOCKED_PERMISSION',
    secondaryProvider: { id: 'SECONDARY_AI_MUSIC_PROVIDER', status: 'PLANNED_NOT_CONNECTED', connectThisStep: false },
    finalUseSubjectToHumanReviewOfFinalArtifact: true,
  };
}

export function approvedCalibrationMerge() {
  return {
    schemaVersion: 'approved.calibration-merge:v1',
    semantics: 'MERGE_PARAMETERS_INTO_PRODUCTION_SPEC_NOT_CONCAT_MP4',
    items: [
      { calibration: 'Vertical Fidelity V2', status: 'HUMAN_ACCEPTED', step: 'B2-15O1' },
      { calibration: 'Narration Voice', status: 'HUMAN_ACCEPTED', step: 'B2-15O2' },
      { calibration: 'Section4 Real UI', status: 'HUMAN_ACCEPTED', step: 'B2-15O2F' },
      { calibration: 'Vertical Opening Stability Repair', status: 'HUMAN_ACCEPTED', step: 'B2-15O2H' },
      { calibration: 'Product Visual Governance', status: 'HUMAN_ACCEPTED', step: 'B2-15O2E' },
    ],
  };
}

export function finalConstraintReconciliation() {
  const registry = productionConstraintRegistry();
  const names = registry.constraints.map((c) => c.name);
  const expected = [
    'SCRIPT_IS_TIMELINE_AUTHORITY',
    'FROZEN_SCRIPT_IMMUTABLE',
    'NARRATION_VOICE_HUMAN_ACCEPTED',
    'NARRATION_SPEED_HUMAN_ACCEPTED',
    'VERTICAL_V2_LIGHT_SHARPEN_SELECTED',
    'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    'REAL_ASSET_FIRST',
    'TRANSFORM_BEFORE_GENERATION',
    'AI_GENERATION_IS_SEMANTIC_GAP_FILLER',
    'DIGITAL_HUMAN_USER_SELF_FIRST',
    'GENERIC_STRANGER_AVATAR_FORBIDDEN_WITHOUT_USER_SELECTION',
    'DIRECTOR_HAS_BGM_AUTHORITY',
    'BGM_NOT_MANDATORY',
    'NO_QUALITY_DOWNGRADE_DUE_TO_MISSING_CONFIGURATION',
    'SHOT_TYPE_DISTRIBUTION_IS_NOT_KPI',
    'C5_RESTRICTED',
    'C6_RESTRICTED',
    'FINAL_HUMAN_ACCEPTANCE_REQUIRED',
    'PUBLICATION_SEPARATE_FROM_PRODUCTION_ACCEPTANCE',
    'UI_DEMO_STABILITY_FIRST',
    'NO_DECORATIVE_MICRO_MOTION_IN_UI_DEMOS',
    'STABLE_CROP_WHEN_SEMANTIC_TARGET_UNCHANGED',
    'MOTION_REQUIRES_SEMANTIC_PURPOSE',
    'NO_SUBPIXEL_DRIFT_FOR_UI_TEXT',
  ];
  const missing = expected.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !expected.includes(n));
  return {
    schemaVersion: 'final.constraint-reconciliation:v1',
    totalConstraints: registry.constraints.length,
    activeConstraints: registry.constraints.length,
    humanAcceptedConstraints: registry.constraints.filter((c) => c.humanApproved).length,
    technicalConstraints: registry.constraints.filter((c) => !c.humanApproved).length,
    conflicts: [] as string[],
    superseded: [] as string[],
    missing,
    extra,
    violations: 0,
    names,
  };
}

export function productionReadinessMatrix() {
  return {
    schemaVersion: 'production.readiness-matrix:v1',
    SCRIPT: 'READY' as ReadinessStatusV1,
    NARRATION: 'READY' as ReadinessStatusV1,
    TIMELINE: 'READY_FOR_FINAL_RENDER' as ReadinessStatusV1,
    VERTICAL_VISUAL: 'READY' as ReadinessStatusV1,
    VERTICAL_MOTION: 'READY' as ReadinessStatusV1,
    LANDSCAPE_VISUAL: 'READY' as ReadinessStatusV1,
    SECTION4: 'READY' as ReadinessStatusV1,
    PRODUCT_VISUAL_CONSISTENCY: 'READY' as ReadinessStatusV1,
    AUDIO_TECHNICAL: 'READY' as ReadinessStatusV1,
    BGM_CONTENT_DECISION: 'READY_WITH_ACCEPTED_CONTENT_VARIANT' as ReadinessStatusV1,
    AI_VIDEO_FALLBACK: 'READY_WITH_ACCEPTED_FALLBACK' as ReadinessStatusV1,
    DIGITAL_HUMAN_FALLBACK: 'READY_WITH_ACCEPTED_FALLBACK' as ReadinessStatusV1,
    TRUTH_C5: 'READY_WITH_RESTRICTIONS' as ReadinessStatusV1,
    TRUTH_C6: 'READY_WITH_RESTRICTIONS' as ReadinessStatusV1,
    CONSTRAINT_INHERITANCE: 'READY' as ReadinessStatusV1,
    SOURCE_INTEGRITY: 'READY' as ReadinessStatusV1,
    notes: {
      AI_VIDEO_FALLBACK: 'Technical path may continue with REAL_UI; not a human-accepted AI Video capability closeout.',
      DIGITAL_HUMAN_FALLBACK: 'Technical path may continue with REAL_UI_CTA; identity gap unresolved.',
    },
  };
}

export function finalProductionTaskGraphV2() {
  return {
    schemaVersion: 'final.production-task-graph:v2',
    corePath: [
      'Original Source',
      'Frozen Script Timing',
      'Accepted Narration',
      '8-beat Visual Assembly',
      'Approved Motion Policies',
      'Approved Section4',
      'Vertical Profile Render',
      'Landscape Profile Render',
      'Audio Mux',
      'Validation',
      'Human Final Review',
    ],
    calibrationMp4NotInCorePath: true,
  };
}

export function optionalCapabilityGraph() {
  return {
    schemaVersion: 'optional.capability-graph:v1',
    isolatedFromCore: true,
    nodes: [
      { capability: 'AI_MUSIC', status: 'BLOCKED_PERMISSION', connectThisStep: false },
      { capability: 'AI_VIDEO', status: 'PROVIDER_NOT_IMPLEMENTED', connectThisStep: false },
      { capability: 'DIGITAL_HUMAN', status: 'MISSING_IDENTITY_ASSET', connectThisStep: false },
    ],
  };
}

export function authorizationRequirement() {
  return {
    schemaVersion: 'final.production-authorization-requirement:v1',
    oldAuthorizationId: FROZEN_PRODUCTION_AUTHORIZATION_ID,
    oldAuthorizationValidForV2: false,
    reason: 'B2-15M authorization bound 35s mute v1 profiles; cannot authorize 45677ms script-driven audio-enabled V2.',
    newFinalProductionAuthorization: 'REQUIRED',
    thisStep: 'DO_NOT_CREATE_AUTHORIZATION',
    status: 'WAITING_FOR_NEW_PRODUCTION_AUTHORIZATION',
    staleIfAnyHashChanges: [
      'FinalProductionSpecificationV2',
      'VerticalProfileV2',
      'LandscapeProfileV2',
      'AudioPolicyV2',
      'ConstraintSnapshot',
    ],
  };
}

export function buildFinalProductionSpecificationV2() {
  const constraints = productionConstraintRegistry();
  const reconciliation = finalConstraintReconciliation();
  const readinessBlocked = reconciliation.missing.length > 0 || reconciliation.conflicts.length > 0 || reconciliation.violations !== 0;
  return {
    schemaVersion: FINAL_PRODUCTION_SPEC_VERSION,
    specificationId: FINAL_PRODUCTION_SPEC_ID,
    status: 'FROZEN_V2' as const,
    projectId: FROZEN_PROJECT_ID,
    scriptId: FROZEN_SCRIPT_ID,
    sourceAssetId: CONTENT_01_NEW_ASSET_ID,
    timelineAuthority: SCRIPT_TIMELINE_AUTHORITY,
    scriptPolicy: { immutable: true, rewrite: false, regenerate: false },
    narrationPolicy: audioPolicyV2(),
    plannedDurationMs: scriptDrivenDurationMs(),
    beatPlanRef: `timeline:${FROZEN_SCRIPT_ID}:script-driven:v1`,
    verticalProfile: verticalProfileV2(),
    landscapeProfile: landscapeProfileV2(),
    visualPolicies: productVisualPolicyFinal(),
    motionPolicies: motionPolicyFinal(),
    audioPolicy: audioPolicyV2(),
    bgmPolicy: bgmContentDecisionFinal(),
    digitalHumanPolicy: {
      identity: 'USER_SELF_FIRST',
      status: 'MISSING_IDENTITY_ASSET',
      content01: 'OPTIONAL',
      fallback: 'REAL_UI_CTA',
      fallbackClass: 'TEMPORARY_FALLBACK',
      strangerAvatar: 'FORBIDDEN_WITHOUT_USER_SELECTION',
      capability: 'PRESERVED',
    },
    aiVideoPolicy: {
      status: 'PROVIDER_NOT_IMPLEMENTED',
      content01: 'ENHANCEMENT',
      fallback: 'REAL_UI',
      fallbackClass: 'TEMPORARY_FALLBACK',
      capability: 'PRESERVED',
    },
    aiImagePolicy: {
      rejected: REJECTED_SECTION4_CANDIDATE,
      productionUsable: false,
      status: 'REJECTED_CALIBRATION_ARTIFACT',
    },
    truthConstraints: ['C5', 'C6'] as Array<'C5' | 'C6'>,
    cumulativeConstraints: constraints.constraints.map((c) => c.name),
    temporaryFallbacks: [
      { capability: 'AI_MUSIC', fallback: 'NARRATION_ONLY', temporary: true },
      { capability: 'AI_VIDEO', fallback: 'REAL_UI', temporary: true },
      { capability: 'DIGITAL_HUMAN', fallback: 'REAL_UI_CTA', temporary: true },
    ],
    unresolvedCapabilities: missingCapabilityLedger(),
    humanAcceptedCalibrations: approvedCalibrationMerge().items,
    productionReadiness: readinessBlocked ? 'BLOCKED' : 'WAITING_FOR_NEW_PRODUCTION_AUTHORIZATION',
    productionSourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
    calibrationArtifactAsProductionSource: CALIBRATION_AS_PRODUCTION_SOURCE,
    noQualityDowngrade: noQualityDowngradePolicy().status,
    humanFullTimelineState: 'READY_FOR_RECONCILED_FINAL_RENDER',
    fullTimelineCalibration: 'FULL_TIMELINE_CALIBRATION_RECONCILED',
    finalProductionAcceptance: 'REQUEST_CHANGES',
    publication: 'BLOCKED',
    productionUsableArtifact: 'NONE_NEW',
    createdAt: SPEC_CREATED_AT,
  };
}

export function assertSpecReadyForFreeze(spec = buildFinalProductionSpecificationV2()) {
  const recon = finalConstraintReconciliation();
  if (spec.sourceAssetId !== CONTENT_01_NEW_ASSET_ID) throw new Error('SOURCE_NOT_ORIGINAL');
  if (spec.calibrationArtifactAsProductionSource !== 'FORBIDDEN') throw new Error('CALIBRATION_SOURCE_NOT_FORBIDDEN');
  if (spec.motionPolicies.opening.kenBurns !== 'FORBIDDEN') throw new Error('KEN_BURNS_NOT_FORBIDDEN');
  if (recon.totalConstraints !== 24 || recon.missing.length || recon.conflicts.length || recon.violations) {
    throw new Error('CONSTRAINT_RECONCILIATION_BLOCKED');
  }
  if (SELECTED_V2_SHARPEN !== 'unsharp=5:5:0.35:3:3:0.0') throw new Error('V2_FILTER_DRIFT');
  return true;
}

void FROZEN_VERTICAL_SHA;
void FROZEN_LANDSCAPE_SHA;

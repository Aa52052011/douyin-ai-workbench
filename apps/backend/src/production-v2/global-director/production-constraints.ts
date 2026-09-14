export const PRODUCTION_CONSTRAINT_REGISTRY_VERSION = 'production.constraint-registry:v1' as const;

export type ConstraintStatusV1 = 'FROZEN' | 'ACTIVE' | 'SUPERSEDED' | 'BLOCKING' | 'INFORMATIONAL';

export type ProductionConstraintV1 = {
  constraintId: string;
  name: string;
  status: ConstraintStatusV1;
  sourceType: 'HUMAN_DECISION' | 'DIRECTOR_POLICY' | 'TRUTH_GATE' | 'SYSTEM_PRINCIPLE';
  sourceStep: string;
  humanApproved: boolean;
  supersedes: string | null;
  appliesTo: string[];
  severity: 'BLOCKING' | 'REQUIRED' | 'INFORMATIONAL';
  violationBehavior: 'GATE_FAIL' | 'BLOCKED_CONSTRAINT_REGRESSION';
};

const ALL_SURFACES = [
  'DirectorPlan',
  'GenerationRequest',
  'AI_IMAGE',
  'AI_VIDEO',
  'DIGITAL_HUMAN',
  'BGM',
  'Timeline',
  'Render',
  'ProductionArtifact',
  'PublicationPackage',
];

function c(
  constraintId: string,
  name: string,
  sourceStep: string,
  sourceType: ProductionConstraintV1['sourceType'],
  humanApproved: boolean,
  extraApplies: string[] = [],
): ProductionConstraintV1 {
  return {
    constraintId,
    name,
    status: 'FROZEN',
    sourceType,
    sourceStep,
    humanApproved,
    supersedes: null,
    appliesTo: [...new Set([...ALL_SURFACES, ...extraApplies])],
    severity: 'BLOCKING',
    violationBehavior: 'BLOCKED_CONSTRAINT_REGRESSION',
  };
}

export function productionConstraintRegistry(): {
  schemaVersion: typeof PRODUCTION_CONSTRAINT_REGISTRY_VERSION;
  constraints: ProductionConstraintV1[];
} {
  return {
    schemaVersion: PRODUCTION_CONSTRAINT_REGISTRY_VERSION,
    constraints: [
      c('A', 'SCRIPT_IS_TIMELINE_AUTHORITY', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('B', 'FROZEN_SCRIPT_IMMUTABLE', 'B2-15O2', 'HUMAN_DECISION', true),
      c('C', 'NARRATION_VOICE_HUMAN_ACCEPTED', 'B2-15O2', 'HUMAN_DECISION', true),
      c('D', 'NARRATION_SPEED_HUMAN_ACCEPTED', 'B2-15O2', 'HUMAN_DECISION', true),
      c('E', 'VERTICAL_V2_LIGHT_SHARPEN_SELECTED', 'B2-15O1', 'HUMAN_DECISION', true),
      c('F', 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY', 'B2-15O2E', 'HUMAN_DECISION', true),
      c('G', 'REAL_ASSET_FIRST', 'B2-15O2E', 'DIRECTOR_POLICY', true),
      c('H', 'TRANSFORM_BEFORE_GENERATION', 'B2-15O2E', 'DIRECTOR_POLICY', true),
      c('I', 'AI_GENERATION_IS_SEMANTIC_GAP_FILLER', 'B2-15O2E', 'DIRECTOR_POLICY', true),
      c('J', 'DIGITAL_HUMAN_USER_SELF_FIRST', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('K', 'GENERIC_STRANGER_AVATAR_FORBIDDEN_WITHOUT_USER_SELECTION', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('L', 'DIRECTOR_HAS_BGM_AUTHORITY', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('M', 'BGM_NOT_MANDATORY', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('N', 'NO_QUALITY_DOWNGRADE_DUE_TO_MISSING_CONFIGURATION', 'B2-15O2F', 'SYSTEM_PRINCIPLE', false),
      c('O', 'SHOT_TYPE_DISTRIBUTION_IS_NOT_KPI', 'B2-15O2B', 'DIRECTOR_POLICY', false),
      c('P', 'C5_RESTRICTED', 'B2-15J', 'TRUTH_GATE', false),
      c('Q', 'C6_RESTRICTED', 'B2-15J', 'TRUTH_GATE', false),
      c('R', 'FINAL_HUMAN_ACCEPTANCE_REQUIRED', 'B2-15N', 'HUMAN_DECISION', true),
      c('S', 'PUBLICATION_SEPARATE_FROM_PRODUCTION_ACCEPTANCE', 'B2-15N', 'SYSTEM_PRINCIPLE', false),
      c(
        'T',
        'UI_DEMO_STABILITY_FIRST',
        'B2-15O2H',
        'DIRECTOR_POLICY',
        false,
        ['SCREEN_RECORDING_UI_DEMO', 'PRODUCT_UI_DEMO', 'DASHBOARD_DEMO', 'SOFTWARE_TUTORIAL', 'SCREENSHOT_MOTION'],
      ),
      c(
        'U',
        'NO_DECORATIVE_MICRO_MOTION_IN_UI_DEMOS',
        'B2-15O2H',
        'DIRECTOR_POLICY',
        false,
        ['SCREEN_RECORDING_UI_DEMO', 'PRODUCT_UI_DEMO', 'DASHBOARD_DEMO', 'SOFTWARE_TUTORIAL', 'SCREENSHOT_MOTION'],
      ),
      c(
        'V',
        'STABLE_CROP_WHEN_SEMANTIC_TARGET_UNCHANGED',
        'B2-15O2H',
        'DIRECTOR_POLICY',
        false,
        ['SCREEN_RECORDING_UI_DEMO', 'PRODUCT_UI_DEMO', 'DASHBOARD_DEMO', 'SOFTWARE_TUTORIAL', 'SCREENSHOT_MOTION'],
      ),
      c(
        'W',
        'MOTION_REQUIRES_SEMANTIC_PURPOSE',
        'B2-15O2H',
        'DIRECTOR_POLICY',
        false,
        ['SCREEN_RECORDING_UI_DEMO', 'PRODUCT_UI_DEMO', 'DASHBOARD_DEMO', 'SOFTWARE_TUTORIAL', 'SCREENSHOT_MOTION'],
      ),
      c(
        'X',
        'NO_SUBPIXEL_DRIFT_FOR_UI_TEXT',
        'B2-15O2H',
        'DIRECTOR_POLICY',
        false,
        ['SCREEN_RECORDING_UI_DEMO', 'PRODUCT_UI_DEMO', 'DASHBOARD_DEMO', 'SOFTWARE_TUTORIAL', 'SCREENSHOT_MOTION'],
      ),
    ],
  };
}

/** Product-strategy constraints added at B2-15O7. Not part of the frozen V2 production snapshot (still 24). */
export function v1ProductStrategyConstraintRegistry(): {
  schemaVersion: 'product.strategy-constraint-registry:v1';
  constraints: ProductionConstraintV1[];
} {
  return {
    schemaVersion: 'product.strategy-constraint-registry:v1',
    constraints: [
      c('Y', 'V1_MANUAL_PUBLICATION_MODE', 'B2-15O7', 'HUMAN_DECISION', true, ['PublicationPackage', 'PublishedPost']),
      c('Z', 'OFFICIAL_PUBLISH_DEFERRED_NOT_REMOVED', 'B2-15O7', 'HUMAN_DECISION', true, ['PublicationPackage']),
      c(
        'AA',
        'MANUAL_POST_REGISTRATION_REQUIRED_FOR_MONITORING',
        'B2-15O7',
        'SYSTEM_PRINCIPLE',
        false,
        ['PublishedPost', 'MonitoringTarget'],
      ),
      c('AB', 'EVIDENCE_BEFORE_INTERPRETATION', 'B2-15O8', 'SYSTEM_PRINCIPLE', false, ['PerformanceAnalysis']),
      c('AC', 'NO_CAUSAL_CLAIM_WITHOUT_CAUSAL_EVIDENCE', 'B2-15O8', 'SYSTEM_PRINCIPLE', false, ['PerformanceAnalysis']),
      c('AD', 'NO_BENCHMARK_CLAIM_WITHOUT_BENCHMARK', 'B2-15O8', 'SYSTEM_PRINCIPLE', false, ['PerformanceAnalysis']),
      c('AE', 'NO_RETENTION_CLAIM_WITHOUT_RETENTION_DATA', 'B2-15O8', 'SYSTEM_PRINCIPLE', false, ['PerformanceAnalysis']),
      c(
        'AF',
        'PERFORMANCE_FEEDBACK_REQUIRES_HUMAN_REVIEW',
        'B2-15O8',
        'SYSTEM_PRINCIPLE',
        false,
        ['PerformanceAnalysis', 'ContentPlan', 'Script'],
      ),
    ],
  };
}

export function activeFrozenConstraintCount() {
  return productionConstraintRegistry().constraints.length + v1ProductStrategyConstraintRegistry().constraints.length;
}

export function cumulativeConstraintGate() {
  const production = productionConstraintRegistry();
  const product = v1ProductStrategyConstraintRegistry();
  return {
    schemaVersion: 'cumulative.production-constraint-gate:v1',
    status: 'ACTIVE' as const,
    productionFrozenCount: production.constraints.length,
    productStrategyCount: product.constraints.length,
    activeFrozenCount: production.constraints.length + product.constraints.length,
    inherited: [...production.constraints, ...product.constraints].map((x) => x.constraintId),
    newConstraints: product.constraints.map((x) => x.name),
    regressionCodes: ['GATE_FAIL', 'BLOCKED_CONSTRAINT_REGRESSION'],
  };
}

export function missingCapabilityLedger() {
  return {
    schemaVersion: 'missing.capability-ledger:v1',
    items: [
      {
        capability: 'AI_MUSIC',
        preferredProvider: 'MINIMAX_MUSIC_2_6',
        status: 'BLOCKED_PERMISSION',
        requirementContent01: 'OPTIONAL_FOR_CONTENT_01',
        requirementProduct: 'CAPABILITY_REQUIRED_FOR_PRODUCT',
        qualityStandard: 'UNCHANGED',
        userActionRequired: true,
        whatIsMissing: 'MiniMax Music entitlement (API key exists, product permission blocked)',
        whereToConfigure: 'MiniMax account Music / MiniMax Audio entitlement; optional later secondary provider',
        envVariableNames: [] as string[],
        externalAccountAction: '开通 Music 权限或后续接入 SECONDARY_AI_MUSIC_PROVIDER',
        environmentVariableMissing: false,
        currentCredential: 'EXISTS',
      },
      {
        capability: 'AI_VIDEO',
        preferredProvider: 'WANXIANG_OR_EQUIVALENT',
        status: 'PROVIDER_NOT_IMPLEMENTED',
        requirementContent01: 'ENHANCEMENT_FOR_CONTENT_01',
        requirementProduct: 'CAPABILITY_REQUIRED_FOR_PRODUCT',
        qualityStandard: 'UNCHANGED',
        userActionRequired: false,
        whatIsMissing: 'Wanxiang/equivalent video adapter implementation',
        whereToConfigure: 'Implement adapter first, then audit WANX video config',
        envVariableNames: [] as string[],
        externalAccountAction: null,
      },
      {
        capability: 'DIGITAL_HUMAN',
        preferredProvider: 'USER_SELF_FIRST',
        status: 'MISSING_IDENTITY_ASSET',
        requirementContent01: 'OPTIONAL_FOR_CONTENT_01',
        requirementProduct: 'CAPABILITY_REQUIRED_FOR_PRODUCT',
        identityPolicy: 'USER_SELF_FIRST',
        qualityStandard: 'UNCHANGED',
        userActionRequired: true,
        whatIsMissing: 'User self photo/video',
        whereToConfigure: 'Creator identity library (not env secret)',
        envVariableNames: [] as string[],
        externalAccountAction: '未来启用数字人时上传本人照片/视频',
      },
    ],
  };
}

export function capabilityRecoveryPlan() {
  return {
    schemaVersion: 'capability.recovery-plan:v1',
    minimaxMusic: {
      optionA: '获得 Music entitlement',
      optionB: '接 Secondary AI Music Provider',
      qualityStandard: 'unchanged',
    },
    aiVideo: {
      option: '实现 Wanxiang Video Adapter 或兼容 AI Video Provider',
      qualityStandard: 'unchanged',
    },
    digitalHuman: {
      option: '用户上传本人素材后启用',
      qualityStandard: 'unchanged',
    },
  };
}

export function capabilityFailurePolicy() {
  return {
    schemaVersion: 'capability.failure-policy:v1',
    onProviderFailure: ['try_approved_fallback_provider_if_available', 'temporary_content_fallback'],
    preserveProductCapabilityRequirement: true,
    secondaryAiMusicProvider: {
      id: 'SECONDARY_AI_MUSIC_PROVIDER',
      reserved: true,
      implemented: false,
      called: false,
      envRequiredNow: [] as string[],
    },
    narrationOnlyContent01: {
      classification: 'TEMPORARY_OR_ACCEPTABLE_CONTENT_VARIANT',
      not: 'FINAL_PREFERRED_SOLUTION',
      notPermanentProductDefault: true,
      bgmIncludedInThisCalibration: false,
      bgmLabel: 'NOT_INCLUDED_IN_THIS_CALIBRATION',
    },
  };
}

export function noQualityDowngradePolicy() {
  return {
    schemaVersion: 'no-quality-downgrade-due-to-missing-configuration:v1',
    status: 'ACTIVE' as const,
    forbiddenEquivalences: [
      { missing: 'MiniMax blocked', notEqualTo: 'BGM feature disabled forever' },
      { missing: 'AI Video not implemented', notEqualTo: 'remove AI video capability' },
      { missing: 'Digital Human missing self media', notEqualTo: 'use stranger avatar' },
    ],
  };
}

export function detectConstraintRegression(input: {
  sourceDurationIsTimelineAuthority?: boolean;
  narrationSpedUp?: boolean;
  verticalForgotV2?: boolean;
  aiImageAdvertisementLike?: boolean;
  strangerAvatarAuto?: boolean;
  lostC5C6?: boolean;
  bgmCapabilityDeletedAfterProviderFailure?: boolean;
}): { ok: boolean; code: string | null } {
  if (input.sourceDurationIsTimelineAuthority) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.narrationSpedUp) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.verticalForgotV2) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.aiImageAdvertisementLike) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.strangerAvatarAuto) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.lostC5C6) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  if (input.bgmCapabilityDeletedAfterProviderFailure) return { ok: false, code: 'BLOCKED_CONSTRAINT_REGRESSION' };
  return { ok: true, code: null };
}

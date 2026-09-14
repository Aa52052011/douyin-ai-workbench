import { createHash } from 'node:crypto';
import {
  LANDSCAPE_UI_DEMO_PROFILE,
  VERTICAL_DOUYIN_PROFILE,
  type ProductionOutputProfileV1,
} from './profiles.js';

export const OUTPUT_STRATEGY_VERSION = 'output-strategy:v1' as const;
export const OUTPUT_SELECTION_VERSION = 'output-selection:v1' as const;
export const DUAL_OUTPUT_PRODUCTION_PLAN_VERSION = 'dual-output.production-plan:v1' as const;
export const SOURCE_TYPE_OUTPUT_RECOMMENDATION_VERSION = 'source-type.output-recommendation:v1' as const;
export const PRODUCTION_PROFILE_GATE_VERSION = 'production.profile-gate:v1' as const;
export const PLATFORM_OUTPUT_MAPPING_VERSION = 'platform.output-mapping:v1' as const;

export const OUTPUT_STRATEGIES = [
  'VERTICAL_ONLY',
  'LANDSCAPE_ONLY',
  'DUAL_VERTICAL_AND_LANDSCAPE',
  'SOURCE_NATIVE_ONLY',
  'HUMAN_DECISION_REQUIRED',
] as const;
export type OutputStrategyV1 = (typeof OUTPUT_STRATEGIES)[number];

export const OUTPUT_SELECTION_SOURCES = [
  'EXPLICIT_USER_MESSAGE',
  'USER_UI_ACTION',
  'SYSTEM_INFERENCE',
  'DIRECTOR_AUTO_SELECTION',
  'UI_APPROVE_ACTION',
] as const;
export type OutputSelectionSourceV1 = (typeof OUTPUT_SELECTION_SOURCES)[number];

export const PRODUCTION_PROFILE_STATUSES = [
  'SELECTED',
  'NOT_SELECTED',
  'READY_FOR_PRODUCTION',
  'BLOCKED',
  'PRODUCED',
] as const;
export type ProductionProfileStatusV1 = (typeof PRODUCTION_PROFILE_STATUSES)[number];

export const VERTICAL_PROFILE_ID = 'production.vertical.douyin:v1' as const;
export const LANDSCAPE_PROFILE_ID = 'production.landscape.ui-demo:v1' as const;

export type OutputSelectionPersistenceV1 = {
  schemaVersion: typeof OUTPUT_SELECTION_VERSION;
  selectionId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  contentId?: string;
  reviewSessionId: string;
  sourceVisualType: string;
  selectedStrategy: OutputStrategyV1;
  selectedProfileIds: string[];
  selectionSource: OutputSelectionSourceV1;
  humanFeedbackRef?: string;
  verticalPreference?: string;
  landscapePreference?: string;
  createdAt: string;
  updatedAt: string;
};

export type SourceTypeOutputRecommendationInputsV1 = {
  sourceVisualType: string;
  sourceAspectRatio: number;
  uiDensity: 'HIGH' | 'MEDIUM' | 'LOW';
  textDensity: 'HIGH' | 'MEDIUM' | 'LOW';
  verticalReadability: 'REDUCED_BY_WHOLE_PAGE_FIT' | 'ACCEPTABLE' | 'UNKNOWN';
  landscapeReadability: 'NEAR_NATIVE_PIXELS' | 'ACCEPTABLE' | 'UNKNOWN';
  fullscreenRequirement: 'LIKELY' | 'OPTIONAL' | 'UNKNOWN';
  humanPreferenceHistory?: Array<{ strategy?: string; source?: string }>;
};

export type SourceTypeOutputRecommendationPolicyV1 = {
  schemaVersion: typeof SOURCE_TYPE_OUTPUT_RECOMMENDATION_VERSION;
  sourceVisualType: string;
  inputs: SourceTypeOutputRecommendationInputsV1;
  recommendedStrategy: OutputStrategyV1;
  forced: false;
  kind: 'recommendation';
  defaultUiHint: 'VERTICAL' | 'LANDSCAPE' | 'DUAL' | 'HUMAN_DECISION_REQUIRED';
  reason: string;
};

export type DualOutputPlanProfileV1 = {
  profileId: string;
  resolution: string;
  aspect: string;
  compositionPolicy: string;
  sourcePolicy: 'DIRECT_FROM_ORIGINAL';
  encodePolicy: {
    codec: 'H.264';
    pixelFormat: 'yuv420p';
    crf: 18;
    scaler: 'lanczos';
    fps: 30;
  };
  status: ProductionProfileStatusV1;
  configHash: string;
  productionUsableAfterRender: false;
};

export type DualOutputProductionPlanV1 = {
  schemaVersion: typeof DUAL_OUTPUT_PRODUCTION_PLAN_VERSION;
  strategy: OutputStrategyV1;
  profiles: DualOutputPlanProfileV1[];
  sourceAssetId: string;
  sourceAwarePlanRef: string;
  approvalRequired: true;
  authorizationRequired: true;
  productionUsableAfterRender: false;
  estimatedRenderMultiplier: number;
  separateArtifactsRequired: true;
  chainingForbidden: ['VERTICAL_TO_LANDSCAPE', 'LANDSCAPE_TO_VERTICAL', 'REVIEW_PREVIEW_TO_PRODUCTION'];
};

export type ProductionProfileGateCheckV1 = {
  id:
    | 'OUTPUT_STRATEGY_SELECTED'
    | 'PROFILE_CONFIG_VALID'
    | 'SOURCE_ORIGINAL_AVAILABLE'
    | 'VISUAL_REVIEW_APPROVED'
    | 'TRUTH_GATE_PASS'
    | 'PRODUCTION_AUTHORIZED';
  result: 'PASS' | 'FAIL' | 'NOT_YET' | 'NO' | 'EXISTING';
};

export type ProductionProfileGateV1 = {
  schemaVersion: typeof PRODUCTION_PROFILE_GATE_VERSION;
  checks: ProductionProfileGateCheckV1[];
  readyForProduction: false | true;
  autoAuthorizationForbidden: true;
  autoHumanApprovalForbidden: true;
};

export type PlatformOutputMappingV1 = {
  schemaVersion: typeof PLATFORM_OUTPUT_MAPPING_VERSION;
  mappings: Array<{
    profileId: string;
    platformSlot:
      | 'DOUYIN_FEED'
      | 'DOUYIN_LANDSCAPE_FULLSCREEN'
      | 'OTHER_PLATFORM_VERTICAL'
      | 'OTHER_PLATFORM_LANDSCAPE';
  }>;
  publishingEnabled: false;
};

export const VERTICAL_GEOMETRY_POLICY = {
  composition: 'SMART_UI_FIT',
  director: 'WIDE_FIRST',
  sourceAware: true,
  forbidPreviewUpscaleAsProductionInput: true,
  source: 'DIRECT_FROM_ORIGINAL',
} as const;

export const LANDSCAPE_GEOMETRY_POLICY = {
  composition: 'SCALE_TO_FIT_PLUS_VERTICAL_PAD',
  stretch: false,
  preserveSemanticContainer: true,
  preferCompleteUi: true,
  allowVerticalPad: true,
  sourceWidth: 1920,
  sourceHeight: 1040,
  source: 'DIRECT_FROM_ORIGINAL',
} as const;

export const PLATFORM_OUTPUT_MAPPING: PlatformOutputMappingV1 = {
  schemaVersion: PLATFORM_OUTPUT_MAPPING_VERSION,
  mappings: [
    { profileId: VERTICAL_PROFILE_ID, platformSlot: 'DOUYIN_FEED' },
    { profileId: LANDSCAPE_PROFILE_ID, platformSlot: 'DOUYIN_LANDSCAPE_FULLSCREEN' },
  ],
  publishingEnabled: false,
};

export function profileConfigHash(input: {
  profileId: string;
  width: number;
  height: number;
  compositionPolicy: string;
  sourcePolicy: string;
  encodePolicy: DualOutputPlanProfileV1['encodePolicy'];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function encodePolicyFromProfile(profile: ProductionOutputProfileV1): DualOutputPlanProfileV1['encodePolicy'] {
  return {
    codec: 'H.264',
    pixelFormat: 'yuv420p',
    crf: 18,
    scaler: 'lanczos',
    fps: 30 as const,
  };
}

export function selectedProfileIdsForStrategy(strategy: OutputStrategyV1): string[] {
  if (strategy === 'VERTICAL_ONLY') return [VERTICAL_PROFILE_ID];
  if (strategy === 'LANDSCAPE_ONLY') return [LANDSCAPE_PROFILE_ID];
  if (strategy === 'DUAL_VERTICAL_AND_LANDSCAPE') return [VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID];
  return [];
}

export function recommendSourceTypeOutput(
  input: SourceTypeOutputRecommendationInputsV1,
): SourceTypeOutputRecommendationPolicyV1 {
  const uiDemo = input.sourceVisualType === 'SCREEN_RECORDING_UI_DEMO';
  if (!uiDemo) {
    return {
      schemaVersion: SOURCE_TYPE_OUTPUT_RECOMMENDATION_VERSION,
      sourceVisualType: input.sourceVisualType,
      inputs: input,
      recommendedStrategy: 'HUMAN_DECISION_REQUIRED',
      forced: false,
      kind: 'recommendation',
      defaultUiHint: 'HUMAN_DECISION_REQUIRED',
      reason: 'NO_UNIVERSAL_DUAL_RULE',
    };
  }
  return {
    schemaVersion: SOURCE_TYPE_OUTPUT_RECOMMENDATION_VERSION,
    sourceVisualType: input.sourceVisualType,
    inputs: input,
    recommendedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    forced: false,
    kind: 'recommendation',
    defaultUiHint: 'DUAL',
    reason: 'VERIFIED_HUMAN_UAT_SCREEN_RECORDING_UI_DEMO',
  };
}

export function defaultUiDemoRecommendationInputs(): SourceTypeOutputRecommendationInputsV1 {
  return {
    sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
    sourceAspectRatio: 1920 / 1040,
    uiDensity: 'HIGH',
    textDensity: 'HIGH',
    verticalReadability: 'REDUCED_BY_WHOLE_PAGE_FIT',
    landscapeReadability: 'NEAR_NATIVE_PIXELS',
    fullscreenRequirement: 'LIKELY',
    humanPreferenceHistory: [
      { strategy: 'DUAL_VERTICAL_AND_LANDSCAPE', source: 'EXPLICIT_USER_MESSAGE' },
    ],
  };
}

function planProfile(
  profile: ProductionOutputProfileV1,
  compositionPolicy: string,
  selected: boolean,
): DualOutputPlanProfileV1 {
  const encodePolicy = encodePolicyFromProfile(profile);
  return {
    profileId: profile.profileId,
    resolution: `${profile.width}x${profile.height}`,
    aspect: profile.width > profile.height ? '16:9' : '9:16',
    compositionPolicy,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL',
    encodePolicy,
    status: selected ? 'SELECTED' : 'NOT_SELECTED',
    configHash: profileConfigHash({
      profileId: profile.profileId,
      width: profile.width,
      height: profile.height,
      compositionPolicy,
      sourcePolicy: 'DIRECT_FROM_ORIGINAL',
      encodePolicy,
    }),
    productionUsableAfterRender: false,
  };
}

export function buildDualOutputProductionPlan(input: {
  strategy: OutputStrategyV1;
  sourceAssetId: string;
  sourceAwarePlanRef: string;
}): DualOutputProductionPlanV1 {
  const ids = new Set(selectedProfileIdsForStrategy(input.strategy));
  const profiles = [
    planProfile(VERTICAL_DOUYIN_PROFILE, 'SMART_UI_FIT+WIDE_FIRST+SOURCE_AWARE', ids.has(VERTICAL_PROFILE_ID)),
    planProfile(LANDSCAPE_UI_DEMO_PROFILE, 'SCALE_TO_FIT_PLUS_VERTICAL_PAD', ids.has(LANDSCAPE_PROFILE_ID)),
  ];
  return {
    schemaVersion: DUAL_OUTPUT_PRODUCTION_PLAN_VERSION,
    strategy: input.strategy,
    profiles,
    sourceAssetId: input.sourceAssetId,
    sourceAwarePlanRef: input.sourceAwarePlanRef,
    approvalRequired: true,
    authorizationRequired: true,
    productionUsableAfterRender: false,
    estimatedRenderMultiplier: ids.size,
    separateArtifactsRequired: true,
    chainingForbidden: ['VERTICAL_TO_LANDSCAPE', 'LANDSCAPE_TO_VERTICAL', 'REVIEW_PREVIEW_TO_PRODUCTION'],
  };
}

export function evaluateProductionProfileGate(input: {
  strategySelected: boolean;
  profileConfigValid: boolean;
  sourceOriginalAvailable: boolean;
  visualReviewApproved: boolean;
  truthGate: 'PASS' | 'FAIL' | 'NOT_YET' | 'EXISTING';
  productionAuthorized: boolean;
}): ProductionProfileGateV1 {
  const checks: ProductionProfileGateCheckV1[] = [
    { id: 'OUTPUT_STRATEGY_SELECTED', result: input.strategySelected ? 'PASS' : 'FAIL' },
    { id: 'PROFILE_CONFIG_VALID', result: input.profileConfigValid ? 'PASS' : 'FAIL' },
    { id: 'SOURCE_ORIGINAL_AVAILABLE', result: input.sourceOriginalAvailable ? 'PASS' : 'FAIL' },
    { id: 'VISUAL_REVIEW_APPROVED', result: input.visualReviewApproved ? 'PASS' : 'NOT_YET' },
    { id: 'TRUTH_GATE_PASS', result: input.truthGate },
    { id: 'PRODUCTION_AUTHORIZED', result: input.productionAuthorized ? 'PASS' : 'NO' },
  ];
  return {
    schemaVersion: PRODUCTION_PROFILE_GATE_VERSION,
    checks,
    readyForProduction: false,
    autoAuthorizationForbidden: true,
    autoHumanApprovalForbidden: true,
  };
}

export function content01HumanFeedback() {
  return {
    verticalFeedback: 'V 竖屏更舒服',
    landscapeFeedback: 'L 横屏明显更好，基本像平时看到的抖音录屏视频',
    isApproval: false,
    isAuthorization: false,
  };
}

export function buildOutputSelection(input: {
  selectionId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  contentId?: string;
  reviewSessionId: string;
  sourceVisualType: string;
  selectedStrategy: OutputStrategyV1;
  selectionSource: OutputSelectionSourceV1;
  humanFeedbackRef?: string;
  verticalPreference?: string;
  landscapePreference?: string;
  createdAt?: string;
  updatedAt?: string;
}): OutputSelectionPersistenceV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: OUTPUT_SELECTION_VERSION,
    selectionId: input.selectionId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    contentId: input.contentId,
    reviewSessionId: input.reviewSessionId,
    sourceVisualType: input.sourceVisualType,
    selectedStrategy: input.selectedStrategy,
    selectedProfileIds: selectedProfileIdsForStrategy(input.selectedStrategy),
    selectionSource: input.selectionSource,
    humanFeedbackRef: input.humanFeedbackRef,
    verticalPreference: input.verticalPreference,
    landscapePreference: input.landscapePreference,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

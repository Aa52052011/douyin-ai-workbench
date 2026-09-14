import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import {
  LANDSCAPE_PROFILE_ID,
  VERTICAL_PROFILE_ID,
  buildDualOutputProductionPlan,
  selectedProfileIdsForStrategy,
  type OutputSelectionPersistenceV1,
  type OutputStrategyV1,
} from './dual-output.js';

export const FINAL_VISUAL_APPROVAL_GATE_VERSION = 'final.visual-approval-gate:v1' as const;
export const FINAL_TRUTH_GATE_VERSION = 'final.truth-gate:v1' as const;
export const DUAL_PROFILE_READINESS_VERSION = 'dual-profile.production-readiness:v1' as const;
export const PRODUCTION_ARTIFACT_VERSION = 'production.artifact:v1' as const;
export const DUAL_PROFILE_EXECUTION_PLAN_VERSION = 'dual-profile.production-execution-plan:v1' as const;
export const CANDIDATE_QUALITY_POLICY_VERSION = 'candidate.production-quality-policy:v1' as const;
export const PRODUCTION_EXECUTION_PREPARATION_VERSION = 'production.execution-preparation:v1' as const;

export const FINAL_VISUAL_GATE_CHECKS = [
  'WHOLE_UI_COMPOSITION_ACCEPTABLE',
  'TEXT_AND_CONTAINER_INTEGRITY_ACCEPTABLE',
  'BLANK_GAP_RESOLVED',
  'MOBILE_VERTICAL_PROFILE_ACCEPTABLE',
  'LANDSCAPE_FULLSCREEN_PROFILE_ACCEPTABLE',
  'SOURCE_AWARE_DIRECTION_ACCEPTABLE',
  'OUTPUT_STRATEGY_SELECTED',
  'TRUTH_BOUNDARY_PRESERVED',
  'NO_PREVIEW_AS_PRODUCTION_SOURCE',
] as const;
export type FinalVisualGateCheckIdV1 = (typeof FINAL_VISUAL_GATE_CHECKS)[number];

export const PRODUCTION_GATE_CHAIN = [
  'OUTPUT_STRATEGY_SELECTED',
  'PROFILE_CONFIG_VALID',
  'SOURCE_ORIGINAL_AVAILABLE',
  'VISUAL_REVIEW_APPROVED',
  'TRUTH_GATE_ACCEPTABLE',
  'PRODUCTION_AUTHORIZED',
  'READY_TO_RENDER',
  'PRODUCTION_RENDER_SUCCESS',
  'ARTIFACT_VALIDATED',
  'PRODUCTION_USABLE_TRUE',
] as const;

export type ProfileReadinessStateV1 =
  | 'READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION'
  | 'READY_EXCEPT_PRODUCTION_AUTHORIZATION'
  | 'NOT_IN_SELECTED_STRATEGY'
  | 'BLOCKED'
  | 'READY_TO_RENDER';

export type ExecutionPlanStatusV1 =
  | 'WAITING_FOR_VISUAL_APPROVAL'
  | 'WAITING_FOR_PRODUCTION_AUTHORIZATION'
  | 'AUTHORIZED_PREPARED'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'PRODUCTION_COMPLETED'
  | 'PRODUCTION_PARTIAL'
  | 'BLOCKED';

export type FinalVisualApprovalGateV1 = {
  schemaVersion: typeof FINAL_VISUAL_APPROVAL_GATE_VERSION;
  checks: Array<{
    id: FinalVisualGateCheckIdV1;
    evidencePresent: boolean;
    result: 'PASS' | 'NOT_YET' | 'FAIL';
  }>;
  overall: 'NOT_YET' | 'APPROVED' | 'REJECTED';
  humanApproved: false | true;
  approvalObject: null | string;
  inferredFromPreferenceEvidence: false;
};

export type FinalTruthClaimV1 = {
  claimId: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
  state: 'SUPPORTED_BY_EXISTING_VISUAL_EVIDENCE' | 'RESTRICTED' | 'FORBIDDEN_TO_BOOST';
  note: string;
};

export type FinalTruthGateV1 = {
  schemaVersion: typeof FINAL_TRUTH_GATE_VERSION;
  result: 'PASS' | 'PASS_WITH_RESTRICTIONS' | 'FAIL';
  claims: FinalTruthClaimV1[];
  restrictedClaims: Array<'C5' | 'C6'>;
  scriptDidNotBoostRestrictedClaims: true;
};

export type ProfileReadinessV1 = {
  profileId: string;
  includedInSelectedStrategy: boolean;
  checks: Record<string, boolean>;
  state: ProfileReadinessStateV1;
  independentOfSibling: true;
};

export type DualProfileProductionReadinessV1 = {
  schemaVersion: typeof DUAL_PROFILE_READINESS_VERSION;
  vertical: ProfileReadinessV1;
  landscape: ProfileReadinessV1;
};

export type ProductionArtifactV1 = {
  schemaVersion: typeof PRODUCTION_ARTIFACT_VERSION;
  artifactId: string;
  profileId: string;
  sourceAssetId: string;
  productionPlanId: string;
  executionRunId: string;
  configHash: string;
  resolution: string;
  codec: 'H.264';
  fps: number;
  pixelFormat: 'yuv420p';
  duration: number | null;
  durationMs: number | null;
  bytes: number;
  productionUsable: boolean;
  truthGateRef: string;
  restrictedClaims: Array<'C5' | 'C6'>;
  visualApprovalRef: string | null;
  authorizationRef: string | null;
  sourcePolicy: 'DIRECT_FROM_ORIGINAL';
  createdAt: string;
};

export type DualProfileProductionExecutionPlanV1 = {
  schemaVersion: typeof DUAL_PROFILE_EXECUTION_PLAN_VERSION;
  planId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  sourceAssetId: string;
  outputStrategy: OutputStrategyV1;
  profiles: Array<{ profileId: string; configHash: string; resolution: string }>;
  visualApprovalRequired: true;
  truthGateRef: typeof FINAL_TRUTH_GATE_VERSION;
  restrictedClaims: Array<'C5' | 'C6'>;
  productionAuthorizationRequired: true;
  directFromOriginalRequired: true;
  createdAt: string;
  status: ExecutionPlanStatusV1;
  visualApprovalId?: string | null;
  productionAuthorizationId?: string | null;
  executionPreparationId?: string | null;
  calibrationPromotionForbidden: true;
  autoRenderOnApprovalForbidden: true;
  autoRenderOnAuthorizationForbidden?: true;
};

export type ProductionExecutionPreparationV1 = {
  schemaVersion: typeof PRODUCTION_EXECUTION_PREPARATION_VERSION;
  preparationId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  authorizationId: string;
  approvalId: string;
  sourceAssetId: string;
  sourcePolicy: 'DIRECT_FROM_ORIGINAL';
  outputStrategy: OutputStrategyV1;
  profiles: Array<{ profileId: string; configHash: string; resolution: string }>;
  truthGateRef: typeof FINAL_TRUTH_GATE_VERSION;
  restrictedClaims: Array<'C5' | 'C6'>;
  status: 'AUTHORIZED_PREPARED';
  renderScheduled: false;
  productionFfmpegScheduled: false;
  calibrationInputsForbidden: true;
  previewInputsForbidden: true;
  calibrationPromotionForbidden: true;
  autoRenderForbidden: true;
  immutable: true;
  createdAt: string;
};

export const CONTENT_01_HUMAN_VISUAL_EVIDENCE = {
  'B2-15F': '整体 source-aware wide-first 效果达到预期',
  'B2-15G': '1080×1920 CRF18 已接近抖音优质录屏清晰度',
  'B2-15H': 'V 竖屏更舒服；L 横屏明显更好，基本像平时看到的抖音录屏视频',
  'B2-15I': 'Human Selected Strategy = DUAL',
  isHumanApproval: false,
} as const;

export const CANDIDATE_PRODUCTION_QUALITY_POLICY = {
  schemaVersion: CANDIDATE_QUALITY_POLICY_VERSION,
  kind: 'CANDIDATE_PRODUCTION_POLICY' as const,
  locked: false,
  vertical: { resolution: '1080x1920', crf: 18 },
  landscape: { resolution: '1920x1080', crf: 18 },
  noFurtherCrfTuningThisStep: true,
};

export const CALIBRATION_ARTIFACT_NAMES = ['V_1080x1920_crf18.mp4', 'L_1920x1080_crf18.mp4'] as const;

export function evaluateFinalVisualApprovalGate(input: {
  outputStrategySelected: boolean;
  explicitHumanVisualApproval: boolean;
}): FinalVisualApprovalGateV1 {
  const evidenceIds: FinalVisualGateCheckIdV1[] = [
    'WHOLE_UI_COMPOSITION_ACCEPTABLE',
    'TEXT_AND_CONTAINER_INTEGRITY_ACCEPTABLE',
    'BLANK_GAP_RESOLVED',
    'MOBILE_VERTICAL_PROFILE_ACCEPTABLE',
    'LANDSCAPE_FULLSCREEN_PROFILE_ACCEPTABLE',
    'SOURCE_AWARE_DIRECTION_ACCEPTABLE',
    'TRUTH_BOUNDARY_PRESERVED',
    'NO_PREVIEW_AS_PRODUCTION_SOURCE',
  ];
  const approved = input.explicitHumanVisualApproval === true;
  return {
    schemaVersion: FINAL_VISUAL_APPROVAL_GATE_VERSION,
    checks: [
      ...evidenceIds.map((id) => ({
        id,
        evidencePresent: true,
        result: approved ? ('PASS' as const) : ('NOT_YET' as const),
      })),
      {
        id: 'OUTPUT_STRATEGY_SELECTED',
        evidencePresent: input.outputStrategySelected,
        result: input.outputStrategySelected ? 'PASS' : 'FAIL',
      },
    ],
    overall: approved ? 'APPROVED' : 'NOT_YET',
    humanApproved: approved,
    approvalObject: approved ? 'REQUIRES_PERSISTED_APPROVAL_OBJECT' : null,
    inferredFromPreferenceEvidence: false,
  };
}

export function evaluateFinalTruthGate(): FinalTruthGateV1 {
  return {
    schemaVersion: FINAL_TRUTH_GATE_VERSION,
    result: 'PASS_WITH_RESTRICTIONS',
    claims: [
      { claimId: 'C1', state: 'SUPPORTED_BY_EXISTING_VISUAL_EVIDENCE', note: '产品 UI 录屏支持“抖音 AI 智能工作台”，不扩大 claim。' },
      { claimId: 'C2', state: 'SUPPORTED_BY_EXISTING_VISUAL_EVIDENCE', note: '多环节工作台界面可见，不扩大为全流程已自动化。' },
      { claimId: 'C3', state: 'SUPPORTED_BY_EXISTING_VISUAL_EVIDENCE', note: '真实运行中的产品界面，不扩大为全部能力已上线。' },
      { claimId: 'C4', state: 'SUPPORTED_BY_EXISTING_VISUAL_EVIDENCE', note: '可见内容生产工作台，不是单纯文案生成器。' },
      { claimId: 'C5', state: 'RESTRICTED', note: '画面出现发布入口不等于无人值守自动发布已实现。' },
      { claimId: 'C6', state: 'FORBIDDEN_TO_BOOST', note: '禁止保证增长/效果/收益类 claim。' },
    ],
    restrictedClaims: ['C5', 'C6'],
    scriptDidNotBoostRestrictedClaims: true,
  };
}

function verticalChecks(included: boolean): Record<string, boolean> {
  return {
    profileConfigValid: true,
    sourceOriginalAvailable: true,
    resolution1080x1920: true,
    crf18: true,
    smartUiFit: true,
    wideFirst: true,
    semanticIntegrity: true,
    blankGapRegression: true,
    directFromOriginal: true,
    humanSelectedIncludesVertical: included,
  };
}

function landscapeChecks(included: boolean): Record<string, boolean> {
  return {
    profileConfigValid: true,
    sourceOriginalAvailable: true,
    resolution1920x1080: true,
    crf18: true,
    scaleToFit: true,
    noStretch: true,
    semanticIntegrity: true,
    directFromOriginal: true,
    humanSelectedIncludesLandscape: included,
  };
}

export function evaluateDualProfileReadiness(input: {
  strategy: OutputStrategyV1;
  visualApproved: boolean;
  productionAuthorized: boolean;
}): DualProfileProductionReadinessV1 {
  const ids = new Set(selectedProfileIdsForStrategy(input.strategy));
  const stateFor = (included: boolean): ProfileReadinessStateV1 => {
    if (!included) return 'NOT_IN_SELECTED_STRATEGY';
    if (input.visualApproved && input.productionAuthorized) return 'READY_TO_RENDER';
    if (input.visualApproved) return 'READY_EXCEPT_PRODUCTION_AUTHORIZATION';
    return 'READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION';
  };
  return {
    schemaVersion: DUAL_PROFILE_READINESS_VERSION,
    vertical: {
      profileId: VERTICAL_PROFILE_ID,
      includedInSelectedStrategy: ids.has(VERTICAL_PROFILE_ID),
      checks: verticalChecks(ids.has(VERTICAL_PROFILE_ID)),
      state: stateFor(ids.has(VERTICAL_PROFILE_ID)),
      independentOfSibling: true,
    },
    landscape: {
      profileId: LANDSCAPE_PROFILE_ID,
      includedInSelectedStrategy: ids.has(LANDSCAPE_PROFILE_ID),
      checks: landscapeChecks(ids.has(LANDSCAPE_PROFILE_ID)),
      state: stateFor(ids.has(LANDSCAPE_PROFILE_ID)),
      independentOfSibling: true,
    },
  };
}

export function executionPlanStatus(input: {
  visualApproved: boolean;
  productionAuthorized: boolean;
}): ExecutionPlanStatusV1 {
  if (!input.visualApproved) return 'WAITING_FOR_VISUAL_APPROVAL';
  if (!input.productionAuthorized) return 'WAITING_FOR_PRODUCTION_AUTHORIZATION';
  return 'AUTHORIZED_PREPARED';
}

export function readyToRender(input: {
  strategySelected: boolean;
  profileConfigValid: boolean;
  sourceOriginalAvailable: boolean;
  visualApproved: boolean;
  truthAcceptable: boolean;
  productionAuthorized: boolean;
}): boolean {
  return (
    input.strategySelected &&
    input.profileConfigValid &&
    input.sourceOriginalAvailable &&
    input.visualApproved &&
    input.truthAcceptable &&
    input.productionAuthorized
  );
}

export function productionUsableAfterGates(input: {
  visualApproved: boolean;
  truthAcceptable: boolean;
  productionAuthorized: boolean;
  renderSuccess: boolean;
  artifactValidated: boolean;
}): boolean {
  return (
    input.visualApproved &&
    input.truthAcceptable &&
    input.productionAuthorized &&
    input.renderSuccess &&
    input.artifactValidated
  );
}

export function isCalibrationArtifactPath(filePath: string): boolean {
  return CALIBRATION_ARTIFACT_NAMES.some((name) => filePath.replaceAll('\\', '/').endsWith(name));
}

export function calibrationMayBecomeProductionArtifact(): false {
  return false;
}

export function buildProductionArtifactContractExample(input: {
  profileId: string;
  sourceAssetId: string;
  productionPlanId: string;
  configHash: string;
  resolution: string;
}): ProductionArtifactV1 {
  return {
    schemaVersion: PRODUCTION_ARTIFACT_VERSION,
    artifactId: 'NOT_CREATED',
    profileId: input.profileId,
    sourceAssetId: input.sourceAssetId,
    productionPlanId: input.productionPlanId,
    executionRunId: 'NOT_CREATED',
    configHash: input.configHash,
    resolution: input.resolution,
    codec: 'H.264',
    fps: 30,
    pixelFormat: 'yuv420p',
    duration: null,
    durationMs: null,
    bytes: 0,
    productionUsable: false,
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: ['C5', 'C6'],
    visualApprovalRef: null,
    authorizationRef: null,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL',
    createdAt: new Date().toISOString(),
  };
}

export function buildDualProfileExecutionPlan(input: {
  planId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  sourceAssetId?: string;
  selection: OutputSelectionPersistenceV1 | null;
  visualApproved: boolean;
  productionAuthorized: boolean;
}): DualProfileProductionExecutionPlanV1 {
  const strategy = input.selection?.selectedStrategy ?? 'HUMAN_DECISION_REQUIRED';
  const dual = buildDualOutputProductionPlan({
    strategy,
    sourceAssetId: input.sourceAssetId ?? CONTENT_01_NEW_ASSET_ID,
    sourceAwarePlanRef: 'source-aware.editorial-director:v2',
  });
  const truth = evaluateFinalTruthGate();
  return {
    schemaVersion: DUAL_PROFILE_EXECUTION_PLAN_VERSION,
    planId: input.planId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewSessionId: input.reviewSessionId,
    sourceAssetId: input.sourceAssetId ?? CONTENT_01_NEW_ASSET_ID,
    outputStrategy: strategy,
    profiles: dual.profiles
      .filter((item) => item.status === 'SELECTED')
      .map((item) => ({ profileId: item.profileId, configHash: item.configHash, resolution: item.resolution })),
    visualApprovalRequired: true,
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: [...truth.restrictedClaims],
    productionAuthorizationRequired: true,
    directFromOriginalRequired: true,
    createdAt: new Date().toISOString(),
    status: executionPlanStatus({
      visualApproved: input.visualApproved,
      productionAuthorized: input.productionAuthorized,
    }),
    calibrationPromotionForbidden: true,
    autoRenderOnApprovalForbidden: true,
    autoRenderOnAuthorizationForbidden: true,
  };
}

export function buildProductionExecutionPreparation(input: {
  preparationId: string;
  authorizationId: string;
  approvalId: string;
  plan: DualProfileProductionExecutionPlanV1;
}): ProductionExecutionPreparationV1 {
  return {
    schemaVersion: PRODUCTION_EXECUTION_PREPARATION_VERSION,
    preparationId: input.preparationId,
    tenantId: input.plan.tenantId,
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    reviewSessionId: input.plan.reviewSessionId,
    productionPlanId: input.plan.planId,
    authorizationId: input.authorizationId,
    approvalId: input.approvalId,
    sourceAssetId: input.plan.sourceAssetId,
    sourcePolicy: 'DIRECT_FROM_ORIGINAL',
    outputStrategy: input.plan.outputStrategy,
    profiles: input.plan.profiles.map((item) => ({ ...item })),
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: [...input.plan.restrictedClaims],
    status: 'AUTHORIZED_PREPARED',
    renderScheduled: false,
    productionFfmpegScheduled: false,
    calibrationInputsForbidden: true,
    previewInputsForbidden: true,
    calibrationPromotionForbidden: true,
    autoRenderForbidden: true,
    immutable: true,
    createdAt: new Date().toISOString(),
  };
}

export function buildFinalReadinessHttpView(input: {
  selection: OutputSelectionPersistenceV1 | null;
  plan: DualProfileProductionExecutionPlanV1;
  visualApproved: boolean;
  visualApprovalId?: string | null;
  productionAuthorized?: boolean;
  productionAuthorizationId?: string | null;
}) {
  const strategySelected = input.selection?.selectedStrategy === 'DUAL_VERTICAL_AND_LANDSCAPE' ||
    input.selection?.selectedStrategy === 'VERTICAL_ONLY' ||
    input.selection?.selectedStrategy === 'LANDSCAPE_ONLY';
  const productionAuthorized = input.productionAuthorized === true && input.visualApproved;
  const visual = evaluateFinalVisualApprovalGate({
    outputStrategySelected: strategySelected,
    explicitHumanVisualApproval: input.visualApproved,
  });
  const truth = evaluateFinalTruthGate();
  const readiness = evaluateDualProfileReadiness({
    strategy: input.selection?.selectedStrategy ?? 'HUMAN_DECISION_REQUIRED',
    visualApproved: input.visualApproved,
    productionAuthorized,
  });
  const renderReady = readyToRender({
    strategySelected,
    profileConfigValid: true,
    sourceOriginalAvailable: true,
    visualApproved: input.visualApproved,
    truthAcceptable: truth.result === 'PASS' || truth.result === 'PASS_WITH_RESTRICTIONS',
    productionAuthorized,
  });
  return {
    visualApproval: visual.overall,
    humanApproved: input.visualApproved,
    approvalObject: input.visualApproved ? (input.visualApprovalId ?? 'PRESENT') : null,
    approvedBy: input.visualApproved ? 'Human' : 'NONE',
    approvalSource: input.visualApproved ? 'EXPLICIT_USER_MESSAGE' : null,
    truthGate: truth.result,
    restrictedClaims: truth.restrictedClaims,
    verticalReadiness: readiness.vertical.state,
    landscapeReadiness: readiness.landscape.state,
    productionAuthorization: productionAuthorized,
    authorizationObject: productionAuthorized ? (input.productionAuthorizationId ?? 'PRESENT') : null,
    authorizedBy: productionAuthorized ? 'HUMAN_USER' : 'NONE',
    authorizationSource: productionAuthorized ? 'EXPLICIT_USER_MESSAGE' : null,
    executionPlanStatus: productionAuthorized
      ? 'AUTHORIZED_PREPARED'
      : input.visualApproved
        ? 'WAITING_FOR_PRODUCTION_AUTHORIZATION'
        : input.plan.status,
    readyToRender: renderReady,
    productionUsable: false,
    gateChain: PRODUCTION_GATE_CHAIN,
    candidateQualityPolicy: input.visualApproved ? 'APPROVED_VISUAL_POLICY' : CANDIDATE_PRODUCTION_QUALITY_POLICY.kind,
    calibrationPromotable: false,
    autoRenderForbidden: true,
  };
}

import { createHash } from 'node:crypto';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from './dual-output.js';
import {
  FINAL_TRUTH_GATE_VERSION,
  type DualProfileProductionExecutionPlanV1,
} from './final-readiness.js';

export const HUMAN_VISUAL_APPROVAL_VERSION = 'human.visual-approval:v1' as const;
export const PRODUCTION_AUTHORIZATION_VERSION = 'production.authorization:v1' as const;
export const VISUAL_PLAN_VERSION = 'source-aware.editorial-director:v2' as const;

export const FROZEN_B215J_VERTICAL_CONFIG_HASH =
  '0c120ea3489f4288ff51d2895b09ec68e329464825946656f219441012695941';
export const FROZEN_B215J_LANDSCAPE_CONFIG_HASH =
  'a08d7ce4b75ad8e5168a732a6ee001b6c9d4127c14242ef05c5f7159a60fa071';

export const EXPLICIT_VISUAL_APPROVAL_MESSAGE = '我批准当前视觉方案';
export const EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE = '我授权正式生产';

export type HumanVisualApprovalV1 = {
  schemaVersion: typeof HUMAN_VISUAL_APPROVAL_VERSION;
  approvalId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  sourceAssetId: string;
  outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE';
  selectedProfileIds: string[];
  visualPlanRef: typeof VISUAL_PLAN_VERSION;
  truthGateRef: typeof FINAL_TRUTH_GATE_VERSION;
  restrictedClaims: Array<'C5' | 'C6'>;
  verticalConfigHash: string;
  landscapeConfigHash: string;
  productionPlanId: string;
  approvalBindingHash: string;
  evidenceRefs: Array<'B2-15F' | 'B2-15G' | 'B2-15H' | 'B2-15I' | 'B2-15J'>;
  explicitApprovalMessage: typeof EXPLICIT_VISUAL_APPROVAL_MESSAGE;
  approvedBy: 'HUMAN_USER';
  approvalSource: 'EXPLICIT_USER_MESSAGE';
  approvedAt: string;
  immutable: true;
  cropApprovalReused: false;
};

export type ProductionAuthorizationV1 = {
  schemaVersion: typeof PRODUCTION_AUTHORIZATION_VERSION;
  authorizationId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  sourceAssetId: string;
  outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE';
  profileIds: string[];
  verticalConfigHash: string;
  landscapeConfigHash: string;
  truthGateRef: typeof FINAL_TRUTH_GATE_VERSION;
  restrictedClaims: Array<'C5' | 'C6'>;
  approvalId: string;
  approvalBindingHash: string;
  productionPlanId: string;
  authorizationBindingHash: string;
  executionPreparationId: string;
  explicitAuthorizationMessage: typeof EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE;
  authorizedBy: 'HUMAN_USER';
  authorizationSource: 'EXPLICIT_USER_MESSAGE' | 'USER_UI_AUTHORIZE_ACTION';
  authorizedAt: string;
  immutable: true;
  splitProfileAuthorizationForbidden: true;
  calibrationPromotionForbidden: true;
  previewAsProductionInputForbidden: true;
  autoRenderForbidden: true;
};

export type AuthorizationBindingIdentityV1 = ApprovalBindingIdentityV1 & {
  approvalId: string;
};

export type ApprovalBindingIdentityV1 = {
  sourceAssetId: string;
  outputStrategy: string;
  profileIds: string[];
  verticalConfigHash: string;
  landscapeConfigHash: string;
  truthGateRef: string;
  restrictedClaims: Array<'C5' | 'C6'>;
  visualPlanVersion: string;
};

export type ApprovalMatchV1 = 'MATCH' | 'INVALID' | 'STALE' | 'ABSENT';

export function approvalBindingHash(identity: ApprovalBindingIdentityV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceAssetId: identity.sourceAssetId,
        outputStrategy: identity.outputStrategy,
        profileIds: [...identity.profileIds].sort(),
        verticalConfigHash: identity.verticalConfigHash,
        landscapeConfigHash: identity.landscapeConfigHash,
        truthGateRef: identity.truthGateRef,
        restrictedClaims: [...identity.restrictedClaims].sort(),
        visualPlanVersion: identity.visualPlanVersion,
      }),
    )
    .digest('hex');
}

export function identityFromPlan(plan: DualProfileProductionExecutionPlanV1): ApprovalBindingIdentityV1 {
  const vertical = plan.profiles.find((item) => item.profileId === VERTICAL_PROFILE_ID);
  const landscape = plan.profiles.find((item) => item.profileId === LANDSCAPE_PROFILE_ID);
  return {
    sourceAssetId: plan.sourceAssetId,
    outputStrategy: plan.outputStrategy,
    profileIds: plan.profiles.map((item) => item.profileId),
    verticalConfigHash: vertical?.configHash ?? '',
    landscapeConfigHash: landscape?.configHash ?? '',
    truthGateRef: plan.truthGateRef,
    restrictedClaims: [...plan.restrictedClaims],
    visualPlanVersion: VISUAL_PLAN_VERSION,
  };
}

export function matchApprovalToIdentity(approval: HumanVisualApprovalV1, identity: ApprovalBindingIdentityV1): ApprovalMatchV1 {
  if (approval.approvalBindingHash !== approvalBindingHash(identity)) return 'STALE';
  if (approval.sourceAssetId !== identity.sourceAssetId) return 'STALE';
  if (approval.outputStrategy !== identity.outputStrategy) return 'STALE';
  if (approval.verticalConfigHash !== identity.verticalConfigHash) return 'STALE';
  if (approval.landscapeConfigHash !== identity.landscapeConfigHash) return 'STALE';
  if (approval.truthGateRef !== identity.truthGateRef) return 'STALE';
  if (JSON.stringify([...approval.restrictedClaims].sort()) !== JSON.stringify([...identity.restrictedClaims].sort())) {
    return 'STALE';
  }
  if (approval.visualPlanRef !== identity.visualPlanVersion) return 'STALE';
  return 'MATCH';
}

export function assertFrozenB215JHashes(identity: ApprovalBindingIdentityV1): void {
  if (identity.verticalConfigHash !== FROZEN_B215J_VERTICAL_CONFIG_HASH) {
    throw new Error('STOP_HASH_CHANGED_VERTICAL');
  }
  if (identity.landscapeConfigHash !== FROZEN_B215J_LANDSCAPE_CONFIG_HASH) {
    throw new Error('STOP_HASH_CHANGED_LANDSCAPE');
  }
}

export function isExplicitVisualApprovalPhrase(text: string): boolean {
  return text.trim() === EXPLICIT_VISUAL_APPROVAL_MESSAGE;
}

export function isExplicitProductionAuthorizationPhrase(text: string): boolean {
  const value = text.trim();
  return (
    value === EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE ||
    value === '开始正式生成成片' ||
    value === 'Authorize production'
  );
}

export function isAmbiguousAuthorizationPhrase(text: string): boolean {
  const value = text.trim();
  return ['继续', '下一步', '可以', '效果不错', '我批准视觉方案', EXPLICIT_VISUAL_APPROVAL_MESSAGE].includes(value);
}

export function buildHumanVisualApproval(input: {
  approvalId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  identity: ApprovalBindingIdentityV1;
  approvedAt?: string;
}): HumanVisualApprovalV1 {
  return {
    schemaVersion: HUMAN_VISUAL_APPROVAL_VERSION,
    approvalId: input.approvalId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewSessionId: input.reviewSessionId,
    sourceAssetId: input.identity.sourceAssetId,
    outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    selectedProfileIds: [VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID],
    visualPlanRef: VISUAL_PLAN_VERSION,
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: ['C5', 'C6'],
    verticalConfigHash: input.identity.verticalConfigHash,
    landscapeConfigHash: input.identity.landscapeConfigHash,
    productionPlanId: input.productionPlanId,
    approvalBindingHash: approvalBindingHash(input.identity),
    evidenceRefs: ['B2-15F', 'B2-15G', 'B2-15H', 'B2-15I', 'B2-15J'],
    explicitApprovalMessage: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
    approvedBy: 'HUMAN_USER',
    approvalSource: 'EXPLICIT_USER_MESSAGE',
    approvedAt: input.approvedAt ?? new Date().toISOString(),
    immutable: true,
    cropApprovalReused: false,
  };
}

export function productionAuthorizationContract(): {
  schemaVersion: typeof PRODUCTION_AUTHORIZATION_VERSION;
  requiredFields: string[];
  object: null;
  autoCreateForbidden: true;
  visualApprovalDoesNotAuthorize: true;
} {
  return {
    schemaVersion: PRODUCTION_AUTHORIZATION_VERSION,
    requiredFields: [
      'authorizationId',
      'tenantId',
      'workspaceId',
      'projectId',
      'reviewSessionId',
      'sourceAssetId',
      'outputStrategy',
      'profileIds',
      'verticalConfigHash',
      'landscapeConfigHash',
      'truthGateRef',
      'restrictedClaims',
      'approvalId',
      'productionPlanId',
      'authorizedBy',
      'authorizationSource',
      'authorizedAt',
      'immutable',
    ],
    object: null,
    autoCreateForbidden: true,
    visualApprovalDoesNotAuthorize: true,
  };
}

export function authorizationBindingHash(identity: AuthorizationBindingIdentityV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceAssetId: identity.sourceAssetId,
        outputStrategy: identity.outputStrategy,
        profileIds: [...identity.profileIds].sort(),
        verticalConfigHash: identity.verticalConfigHash,
        landscapeConfigHash: identity.landscapeConfigHash,
        truthGateRef: identity.truthGateRef,
        restrictedClaims: [...identity.restrictedClaims].sort(),
        visualPlanVersion: identity.visualPlanVersion,
        approvalId: identity.approvalId,
      }),
    )
    .digest('hex');
}

export function authorizationIdentityFromPlan(
  plan: DualProfileProductionExecutionPlanV1,
  approvalId: string,
): AuthorizationBindingIdentityV1 {
  return { ...identityFromPlan(plan), approvalId };
}

export function matchAuthorizationToIdentity(
  authorization: ProductionAuthorizationV1,
  identity: AuthorizationBindingIdentityV1,
): ApprovalMatchV1 {
  if (authorization.authorizationBindingHash !== authorizationBindingHash(identity)) return 'STALE';
  if (authorization.sourceAssetId !== identity.sourceAssetId) return 'STALE';
  if (authorization.outputStrategy !== identity.outputStrategy) return 'STALE';
  if (authorization.verticalConfigHash !== identity.verticalConfigHash) return 'STALE';
  if (authorization.landscapeConfigHash !== identity.landscapeConfigHash) return 'STALE';
  if (authorization.truthGateRef !== identity.truthGateRef) return 'STALE';
  if (authorization.approvalId !== identity.approvalId) return 'STALE';
  if (JSON.stringify([...authorization.restrictedClaims].sort()) !== JSON.stringify([...identity.restrictedClaims].sort())) {
    return 'STALE';
  }
  return 'MATCH';
}

export function assertDualProfileAuthorization(profileIds: string[]): void {
  const set = new Set(profileIds);
  if (!set.has(VERTICAL_PROFILE_ID) || !set.has(LANDSCAPE_PROFILE_ID) || set.size !== 2) {
    throw new Error('SPLIT_PROFILE_AUTHORIZATION_FORBIDDEN');
  }
}

export function assertTruthRestrictionsUnchanged(restrictedClaims: Array<'C5' | 'C6'>): void {
  if (JSON.stringify([...restrictedClaims].sort()) !== JSON.stringify(['C5', 'C6'])) {
    throw new Error('STOP_TRUTH_RESTRICTIONS_LIFTED');
  }
}

export function buildProductionAuthorization(input: {
  authorizationId: string;
  executionPreparationId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  identity: AuthorizationBindingIdentityV1;
  authorizedAt?: string;
}): ProductionAuthorizationV1 {
  assertFrozenB215JHashes(input.identity);
  assertDualProfileAuthorization(input.identity.profileIds);
  assertTruthRestrictionsUnchanged(input.identity.restrictedClaims);
  if (input.identity.outputStrategy !== 'DUAL_VERTICAL_AND_LANDSCAPE') {
    throw new Error('STOP_STRATEGY_NOT_DUAL');
  }
  return {
    schemaVersion: PRODUCTION_AUTHORIZATION_VERSION,
    authorizationId: input.authorizationId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewSessionId: input.reviewSessionId,
    sourceAssetId: input.identity.sourceAssetId,
    outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    profileIds: [VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID],
    verticalConfigHash: input.identity.verticalConfigHash,
    landscapeConfigHash: input.identity.landscapeConfigHash,
    truthGateRef: FINAL_TRUTH_GATE_VERSION,
    restrictedClaims: ['C5', 'C6'],
    approvalId: input.identity.approvalId,
    approvalBindingHash: approvalBindingHash(input.identity),
    productionPlanId: input.productionPlanId,
    authorizationBindingHash: authorizationBindingHash(input.identity),
    executionPreparationId: input.executionPreparationId,
    explicitAuthorizationMessage: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
    authorizedBy: 'HUMAN_USER',
    authorizationSource: 'EXPLICIT_USER_MESSAGE',
    authorizedAt: input.authorizedAt ?? new Date().toISOString(),
    immutable: true,
    splitProfileAuthorizationForbidden: true,
    calibrationPromotionForbidden: true,
    previewAsProductionInputForbidden: true,
    autoRenderForbidden: true,
  };
}

export function bindProductionAuthorizationToPlan(
  plan: DualProfileProductionExecutionPlanV1,
  authorization: ProductionAuthorizationV1,
): DualProfileProductionExecutionPlanV1 {
  assertFrozenB215JHashes(identityFromPlan(plan));
  assertTruthRestrictionsUnchanged(plan.restrictedClaims);
  if (plan.sourceAssetId !== authorization.sourceAssetId) throw new Error('STOP_SOURCE_BINDING_MISMATCH');
  if (plan.planId !== authorization.productionPlanId) throw new Error('STOP_PLAN_BINDING_MISMATCH');
  if (authorization.verticalConfigHash !== plan.profiles.find((item) => item.profileId === VERTICAL_PROFILE_ID)?.configHash) {
    throw new Error('STOP_HASH_CHANGED_VERTICAL');
  }
  if (authorization.landscapeConfigHash !== plan.profiles.find((item) => item.profileId === LANDSCAPE_PROFILE_ID)?.configHash) {
    throw new Error('STOP_HASH_CHANGED_LANDSCAPE');
  }
  return {
    ...plan,
    productionAuthorizationId: authorization.authorizationId,
    executionPreparationId: authorization.executionPreparationId,
    status: 'AUTHORIZED_PREPARED',
    autoRenderOnAuthorizationForbidden: true,
  };
}

export function createOrReuseProductionAuthorization(input: {
  phrase: string;
  authorizationId: string;
  executionPreparationId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  identity: AuthorizationBindingIdentityV1;
  approvalMatch: ApprovalMatchV1;
  existing: ProductionAuthorizationV1 | null;
}): { authorization: ProductionAuthorizationV1; idempotent: boolean } {
  if (!isExplicitProductionAuthorizationPhrase(input.phrase) || isAmbiguousAuthorizationPhrase(input.phrase)) {
    throw new Error('PRODUCTION_AUTHORIZATION_PHRASE_REQUIRED');
  }
  if (input.approvalMatch !== 'MATCH') {
    throw new Error('VISUAL_APPROVAL_REQUIRED_BEFORE_AUTHORIZATION');
  }
  if (input.existing) {
    if (matchAuthorizationToIdentity(input.existing, input.identity) === 'MATCH') {
      return { authorization: input.existing, idempotent: true };
    }
    throw new Error('EXISTING_AUTHORIZATION_STALE_IMMUTABLE');
  }
  return {
    authorization: buildProductionAuthorization(input),
    idempotent: false,
  };
}

export function bindVisualApprovalToPlan(
  plan: DualProfileProductionExecutionPlanV1,
  approval: HumanVisualApprovalV1,
): DualProfileProductionExecutionPlanV1 {
  return {
    ...plan,
    visualApprovalId: approval.approvalId,
    status: 'WAITING_FOR_PRODUCTION_AUTHORIZATION',
  };
}

export function createOrReuseVisualApproval(input: {
  phrase: string;
  approvalId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  productionPlanId: string;
  identity: ApprovalBindingIdentityV1;
  existing: HumanVisualApprovalV1 | null;
}): { approval: HumanVisualApprovalV1; idempotent: boolean } {
  if (!isExplicitVisualApprovalPhrase(input.phrase)) {
    throw new Error('VISUAL_APPROVAL_PHRASE_REQUIRED');
  }
  if (input.existing) {
    if (matchApprovalToIdentity(input.existing, input.identity) === 'MATCH') {
      return { approval: input.existing, idempotent: true };
    }
    throw new Error('EXISTING_APPROVAL_STALE_IMMUTABLE');
  }
  return {
    approval: buildHumanVisualApproval(input),
    idempotent: false,
  };
}

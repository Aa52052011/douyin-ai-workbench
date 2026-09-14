import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOutputSelection } from './dual-output.js';
import {
  buildDualProfileExecutionPlan,
  buildProductionExecutionPreparation,
  evaluateDualProfileReadiness,
  evaluateFinalTruthGate,
  isCalibrationArtifactPath,
  productionUsableAfterGates,
  readyToRender,
} from './final-readiness.js';
import {
  EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  EXPLICIT_VISUAL_APPROVAL_MESSAGE,
  authorizationIdentityFromPlan,
  bindProductionAuthorizationToPlan,
  bindVisualApprovalToPlan,
  createOrReuseProductionAuthorization,
  createOrReuseVisualApproval,
  identityFromPlan,
  isAmbiguousAuthorizationPhrase,
  isExplicitProductionAuthorizationPhrase,
  matchAuthorizationToIdentity,
} from './visual-approval.js';
import {
  FileProductionAuthorizationStore,
  FileProductionExecutionPreparationStore,
  MemoryProductionAuthorizationStore,
} from './production-authorization-store.js';

const scope = {
  selectionId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  reviewSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  sourceVisualType: 'SCREEN_RECORDING_UI_DEMO' as const,
  selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE' as const,
  selectionSource: 'EXPLICIT_USER_MESSAGE' as const,
};

function plan() {
  return buildDualProfileExecutionPlan({
    planId: 'plan-1',
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    reviewSessionId: scope.reviewSessionId,
    sourceAssetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
    selection: buildOutputSelection(scope),
    visualApproved: true,
    productionAuthorized: false,
  });
}

function approvalFor(current = plan()) {
  return createOrReuseVisualApproval({
    phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
    approvalId: '2f6ed1e4-40f1-4376-9c47-44c2a457e5e0',
    tenantId: current.tenantId,
    workspaceId: current.workspaceId,
    projectId: current.projectId,
    reviewSessionId: current.reviewSessionId,
    productionPlanId: current.planId,
    identity: identityFromPlan(current),
    existing: null,
  }).approval;
}

describe('B2-15L explicit production authorization', () => {
  it('creates authorization from explicit human message with dual-profile binding', () => {
    const current = plan();
    const approval = approvalFor(current);
    const identity = authorizationIdentityFromPlan(current, approval.approvalId);
    const { authorization } = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      approvalMatch: 'MATCH',
      existing: null,
    });
    expect(authorization.authorizationSource).toBe('EXPLICIT_USER_MESSAGE');
    expect(authorization.authorizedBy).toBe('HUMAN_USER');
    expect(authorization.profileIds).toEqual([
      'production.vertical.douyin:v1',
      'production.landscape.ui-demo:v1',
    ]);
    expect(authorization.restrictedClaims).toEqual(['C5', 'C6']);
    expect(authorization.approvalId).toBe(approval.approvalId);
    expect(authorization.immutable).toBe(true);
    expect(authorization.autoRenderForbidden).toBe(true);
  });

  it('is idempotent for the same binding and refuses stale overwrite', async () => {
    const current = plan();
    const approval = approvalFor(current);
    const identity = authorizationIdentityFromPlan(current, approval.approvalId);
    const first = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      approvalMatch: 'MATCH',
      existing: null,
    }).authorization;
    const store = new MemoryProductionAuthorizationStore();
    await store.putIfAbsentOrSameHash(first);
    const again = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-2',
      executionPreparationId: 'prep-2',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      approvalMatch: 'MATCH',
      existing: first,
    });
    expect(again.idempotent).toBe(true);
    expect(again.authorization.authorizationId).toBe(first.authorizationId);
    await expect(store.putIfAbsentOrSameHash({ ...first, authorizationBindingHash: 'other' })).rejects.toThrow(
      'AUTHORIZATION_IMMUTABLE',
    );
  });

  it('advances execution plan to AUTHORIZED_PREPARED without lifting truth restrictions', () => {
    const current = bindVisualApprovalToPlan(plan(), approvalFor());
    const approval = approvalFor(current);
    const { authorization } = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: authorizationIdentityFromPlan(current, approval.approvalId),
      approvalMatch: 'MATCH',
      existing: null,
    });
    const bound = bindProductionAuthorizationToPlan(current, authorization);
    expect(bound.status).toBe('AUTHORIZED_PREPARED');
    expect(bound.status).not.toBe('READY_TO_RENDER');
    expect(bound.restrictedClaims).toEqual(['C5', 'C6']);
    expect(evaluateFinalTruthGate().result).toBe('PASS_WITH_RESTRICTIONS');
    expect(bound.profiles).toEqual(current.profiles);
    expect(bound.autoRenderOnAuthorizationForbidden).toBe(true);
  });

  it('marks authorization stale on source, hash, profile, truth, or approval change', () => {
    const current = plan();
    const approval = approvalFor(current);
    const identity = authorizationIdentityFromPlan(current, approval.approvalId);
    const { authorization } = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      approvalMatch: 'MATCH',
      existing: null,
    });
    expect(matchAuthorizationToIdentity(authorization, { ...identity, verticalConfigHash: 'changed' })).toBe('STALE');
    expect(matchAuthorizationToIdentity(authorization, { ...identity, landscapeConfigHash: 'changed' })).toBe('STALE');
    expect(matchAuthorizationToIdentity(authorization, { ...identity, sourceAssetId: 'other' })).toBe('STALE');
    expect(matchAuthorizationToIdentity(authorization, { ...identity, restrictedClaims: ['C5'] })).toBe('STALE');
    expect(matchAuthorizationToIdentity(authorization, { ...identity, approvalId: 'other' })).toBe('STALE');
  });

  it('refuses ambiguous phrases, missing approval, and split-profile authorization', () => {
    const current = plan();
    const approval = approvalFor(current);
    const identity = authorizationIdentityFromPlan(current, approval.approvalId);
    expect(isAmbiguousAuthorizationPhrase('继续')).toBe(true);
    expect(isExplicitProductionAuthorizationPhrase('继续')).toBe(false);
    expect(isExplicitProductionAuthorizationPhrase(EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE)).toBe(true);
    expect(() =>
      createOrReuseProductionAuthorization({
        phrase: '继续',
        authorizationId: 'authz-1',
        executionPreparationId: 'prep-1',
        tenantId: current.tenantId,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        reviewSessionId: current.reviewSessionId,
        productionPlanId: current.planId,
        identity,
        approvalMatch: 'MATCH',
        existing: null,
      }),
    ).toThrow('PRODUCTION_AUTHORIZATION_PHRASE_REQUIRED');
    expect(() =>
      createOrReuseProductionAuthorization({
        phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
        authorizationId: 'authz-1',
        executionPreparationId: 'prep-1',
        tenantId: current.tenantId,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        reviewSessionId: current.reviewSessionId,
        productionPlanId: current.planId,
        identity,
        approvalMatch: 'ABSENT',
        existing: null,
      }),
    ).toThrow('VISUAL_APPROVAL_REQUIRED_BEFORE_AUTHORIZATION');
    expect(() =>
      createOrReuseProductionAuthorization({
        phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
        authorizationId: 'authz-1',
        executionPreparationId: 'prep-1',
        tenantId: current.tenantId,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        reviewSessionId: current.reviewSessionId,
        productionPlanId: current.planId,
        identity: { ...identity, profileIds: ['production.vertical.douyin:v1'] },
        approvalMatch: 'MATCH',
        existing: null,
      }),
    ).toThrow('SPLIT_PROFILE_AUTHORIZATION_FORBIDDEN');
  });

  it('prepares dual-profile execution without render or calibration promotion', () => {
    const current = plan();
    const approval = approvalFor(current);
    const { authorization } = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: authorizationIdentityFromPlan(current, approval.approvalId),
      approvalMatch: 'MATCH',
      existing: null,
    });
    const preparation = buildProductionExecutionPreparation({
      preparationId: authorization.executionPreparationId,
      authorizationId: authorization.authorizationId,
      approvalId: approval.approvalId,
      plan: current,
    });
    expect(preparation.status).toBe('AUTHORIZED_PREPARED');
    expect(preparation.renderScheduled).toBe(false);
    expect(preparation.productionFfmpegScheduled).toBe(false);
    expect(preparation.sourcePolicy).toBe('DIRECT_FROM_ORIGINAL');
    expect(isCalibrationArtifactPath('V_1080x1920_crf18.mp4')).toBe(true);
    expect(preparation.calibrationPromotionForbidden).toBe(true);
    expect(
      readyToRender({
        strategySelected: true,
        profileConfigValid: true,
        sourceOriginalAvailable: true,
        visualApproved: true,
        truthAcceptable: true,
        productionAuthorized: true,
      }),
    ).toBe(true);
    expect(
      productionUsableAfterGates({
        visualApproved: true,
        truthAcceptable: true,
        productionAuthorized: true,
        renderSuccess: false,
        artifactValidated: false,
      }),
    ).toBe(false);
    const readiness = evaluateDualProfileReadiness({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      visualApproved: true,
      productionAuthorized: true,
    });
    expect(readiness.vertical.state).toBe('READY_TO_RENDER');
    expect(readiness.landscape.state).toBe('READY_TO_RENDER');
  });

  it('scopes authorization by tenant', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215l-authz-'));
    const store = new FileProductionAuthorizationStore(dir);
    const prepStore = new FileProductionExecutionPreparationStore(dir);
    const current = plan();
    const approval = approvalFor(current);
    const { authorization } = createOrReuseProductionAuthorization({
      phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
      authorizationId: 'authz-1',
      executionPreparationId: 'prep-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: authorizationIdentityFromPlan(current, approval.approvalId),
      approvalMatch: 'MATCH',
      existing: null,
    });
    await store.putIfAbsentOrSameHash(authorization);
    await prepStore.putIfAbsent(
      buildProductionExecutionPreparation({
        preparationId: authorization.executionPreparationId,
        authorizationId: authorization.authorizationId,
        approvalId: approval.approvalId,
        plan: current,
      }),
    );
    expect(await store.getByReviewSession(current.tenantId, current.reviewSessionId)).not.toBeNull();
    expect(await store.getByReviewSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current.reviewSessionId)).toBeNull();
    expect(await prepStore.getByReviewSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current.reviewSessionId)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

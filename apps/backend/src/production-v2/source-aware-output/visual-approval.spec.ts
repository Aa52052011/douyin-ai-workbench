import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOutputSelection } from './dual-output.js';
import { buildDualProfileExecutionPlan, evaluateDualProfileReadiness, readyToRender } from './final-readiness.js';
import {
  EXPLICIT_VISUAL_APPROVAL_MESSAGE,
  approvalBindingHash,
  bindVisualApprovalToPlan,
  createOrReuseVisualApproval,
  identityFromPlan,
  isAmbiguousAuthorizationPhrase,
  isExplicitProductionAuthorizationPhrase,
  isExplicitVisualApprovalPhrase,
  matchApprovalToIdentity,
  productionAuthorizationContract,
} from './visual-approval.js';
import { FileVisualApprovalStore, MemoryVisualApprovalStore } from './visual-approval-store.js';

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
    visualApproved: false,
    productionAuthorized: false,
  });
}

describe('B2-15K explicit human visual approval', () => {
  it('creates explicit human approval with correct source', () => {
    const current = plan();
    const { approval } = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: identityFromPlan(current),
      existing: null,
    });
    expect(isExplicitVisualApprovalPhrase(EXPLICIT_VISUAL_APPROVAL_MESSAGE)).toBe(true);
    expect(approval.approvalSource).toBe('EXPLICIT_USER_MESSAGE');
    expect(approval.approvedBy).toBe('HUMAN_USER');
    expect(approval.cropApprovalReused).toBe(false);
    expect(approval.immutable).toBe(true);
  });

  it('is idempotent for the same binding', async () => {
    const current = plan();
    const identity = identityFromPlan(current);
    const first = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      existing: null,
    }).approval;
    const store = new MemoryVisualApprovalStore();
    const saved = await store.putIfAbsentOrSameHash(first);
    const again = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-2',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      existing: saved,
    });
    expect(again.idempotent).toBe(true);
    expect(again.approval.approvalId).toBe(first.approvalId);
    const replay = await store.putIfAbsentOrSameHash({ ...first, approvalId: 'appr-2' });
    expect(replay.approvalId).toBe(first.approvalId);
  });

  it('binds dual profiles and truth restrictions', () => {
    const current = plan();
    const { approval } = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: identityFromPlan(current),
      existing: null,
    });
    expect(approval.selectedProfileIds).toEqual([
      'production.vertical.douyin:v1',
      'production.landscape.ui-demo:v1',
    ]);
    expect(approval.restrictedClaims).toEqual(['C5', 'C6']);
    const bound = bindVisualApprovalToPlan(current, approval);
    expect(bound.status).toBe('WAITING_FOR_PRODUCTION_AUTHORIZATION');
    expect(bound.restrictedClaims).toEqual(['C5', 'C6']);
    expect(bound.profiles.map((item) => item.configHash)).toEqual(current.profiles.map((item) => item.configHash));
  });

  it('marks approval stale on config, source, and truth changes', () => {
    const current = plan();
    const identity = identityFromPlan(current);
    const { approval } = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity,
      existing: null,
    });
    expect(matchApprovalToIdentity(approval, { ...identity, verticalConfigHash: 'changed' })).toBe('STALE');
    expect(matchApprovalToIdentity(approval, { ...identity, landscapeConfigHash: 'changed' })).toBe('STALE');
    expect(matchApprovalToIdentity(approval, { ...identity, sourceAssetId: 'other' })).toBe('STALE');
    expect(matchApprovalToIdentity(approval, { ...identity, restrictedClaims: ['C5'] })).toBe('STALE');
    expect(matchApprovalToIdentity(approval, { ...identity, outputStrategy: 'VERTICAL_ONLY' })).toBe('STALE');
    expect(matchApprovalToIdentity(approval, { ...identity, visualPlanVersion: 'other' })).toBe('STALE');
    expect(approvalBindingHash(identity)).not.toBe(approvalBindingHash({ ...identity, sourceAssetId: 'x' }));
  });

  it('does not authorize or render from visual approval phrases', () => {
    expect(isAmbiguousAuthorizationPhrase('继续')).toBe(true);
    expect(isAmbiguousAuthorizationPhrase(EXPLICIT_VISUAL_APPROVAL_MESSAGE)).toBe(true);
    expect(isExplicitProductionAuthorizationPhrase(EXPLICIT_VISUAL_APPROVAL_MESSAGE)).toBe(false);
    expect(productionAuthorizationContract().object).toBeNull();
    expect(
      readyToRender({
        strategySelected: true,
        profileConfigValid: true,
        sourceOriginalAvailable: true,
        visualApproved: true,
        truthAcceptable: true,
        productionAuthorized: false,
      }),
    ).toBe(false);
    const readiness = evaluateDualProfileReadiness({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      visualApproved: true,
      productionAuthorized: false,
    });
    expect(readiness.vertical.state).toBe('READY_EXCEPT_PRODUCTION_AUTHORIZATION');
    expect(readiness.landscape.state).toBe('READY_EXCEPT_PRODUCTION_AUTHORIZATION');
  });

  it('scopes approval by tenant', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215k-appr-'));
    const store = new FileVisualApprovalStore(dir);
    const current = plan();
    const { approval } = createOrReuseVisualApproval({
      phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
      approvalId: 'appr-1',
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      reviewSessionId: current.reviewSessionId,
      productionPlanId: current.planId,
      identity: identityFromPlan(current),
      existing: null,
    });
    await store.putIfAbsentOrSameHash(approval);
    expect(await store.getByReviewSession(current.tenantId, current.reviewSessionId)).not.toBeNull();
    expect(await store.getByReviewSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current.reviewSessionId)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

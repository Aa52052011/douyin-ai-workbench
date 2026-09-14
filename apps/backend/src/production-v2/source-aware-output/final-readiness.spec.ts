import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOutputSelection } from './dual-output.js';
import { FileExecutionPlanStore, MemoryExecutionPlanStore } from './execution-plan-store.js';
import {
  buildDualProfileExecutionPlan,
  calibrationMayBecomeProductionArtifact,
  evaluateDualProfileReadiness,
  evaluateFinalTruthGate,
  evaluateFinalVisualApprovalGate,
  isCalibrationArtifactPath,
  productionUsableAfterGates,
  readyToRender,
} from './final-readiness.js';

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

describe('B2-15J final visual gate and dual-profile readiness', () => {
  it('keeps DUAL selected execution plan waiting for visual approval', () => {
    const selection = buildOutputSelection(scope);
    const plan = buildDualProfileExecutionPlan({
      planId: 'plan-1',
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      reviewSessionId: scope.reviewSessionId,
      selection,
      visualApproved: false,
      productionAuthorized: false,
    });
    expect(plan.outputStrategy).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect(plan.status).toBe('WAITING_FOR_VISUAL_APPROVAL');
    expect(evaluateFinalVisualApprovalGate({ outputStrategySelected: true, explicitHumanVisualApproval: false }).overall).toBe(
      'NOT_YET',
    );
  });

  it('persists C5/C6 restrictions on the production plan', () => {
    const truth = evaluateFinalTruthGate();
    const plan = buildDualProfileExecutionPlan({
      planId: 'plan-1',
      ...scope,
      selection: buildOutputSelection(scope),
      visualApproved: false,
      productionAuthorized: false,
    });
    expect(truth.restrictedClaims).toEqual(['C5', 'C6']);
    expect(plan.restrictedClaims).toEqual(['C5', 'C6']);
    expect(truth.result).toBe('PASS_WITH_RESTRICTIONS');
  });

  it('evaluates vertical and landscape readiness independently', () => {
    const dual = evaluateDualProfileReadiness({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      visualApproved: false,
      productionAuthorized: false,
    });
    expect(dual.vertical.state).toBe('READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION');
    expect(dual.landscape.state).toBe('READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION');
    const verticalOnly = evaluateDualProfileReadiness({
      strategy: 'VERTICAL_ONLY',
      visualApproved: false,
      productionAuthorized: false,
    });
    expect(verticalOnly.vertical.state).toBe('READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION');
    expect(verticalOnly.landscape.state).toBe('NOT_IN_SELECTED_STRATEGY');
  });

  it('forbids promoting calibration artifacts to production', () => {
    expect(isCalibrationArtifactPath('.local/mobile-aspect-calibration/content-01/V_1080x1920_crf18.mp4')).toBe(true);
    expect(isCalibrationArtifactPath('.local/mobile-aspect-calibration/content-01/L_1920x1080_crf18.mp4')).toBe(true);
    expect(calibrationMayBecomeProductionArtifact()).toBe(false);
  });

  it('keeps productionUsable false before gates', () => {
    expect(
      productionUsableAfterGates({
        visualApproved: false,
        truthAcceptable: true,
        productionAuthorized: false,
        renderSuccess: false,
        artifactValidated: false,
      }),
    ).toBe(false);
  });

  it('separates vertical and landscape config hashes', () => {
    const plan = buildDualProfileExecutionPlan({
      planId: 'plan-1',
      ...scope,
      selection: buildOutputSelection(scope),
      visualApproved: false,
      productionAuthorized: false,
    });
    expect(plan.profiles).toHaveLength(2);
    expect(plan.profiles[0].configHash).not.toBe(plan.profiles[1].configHash);
    expect(plan.profiles[0].profileId).not.toBe(plan.profiles[1].profileId);
  });

  it('denies cross-tenant production plan reads', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215j-plan-'));
    const store = new FileExecutionPlanStore(dir);
    const plan = buildDualProfileExecutionPlan({
      planId: 'plan-1',
      ...scope,
      selection: buildOutputSelection(scope),
      visualApproved: false,
      productionAuthorized: false,
    });
    await store.upsert(plan);
    expect(await store.getByReviewSession(scope.tenantId, scope.reviewSessionId)).not.toBeNull();
    expect(await store.getByReviewSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', scope.reviewSessionId)).toBeNull();
    const memory = new MemoryExecutionPlanStore();
    await memory.upsert(plan);
    expect(await memory.getByReviewSession('ffffffff-ffff-4fff-8fff-ffffffffffff', scope.reviewSessionId)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not treat visual approval as authorization or READY_TO_RENDER', () => {
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
    const plan = buildDualProfileExecutionPlan({
      planId: 'plan-1',
      ...scope,
      selection: buildOutputSelection(scope),
      visualApproved: true,
      productionAuthorized: false,
    });
    expect(plan.status).toBe('WAITING_FOR_PRODUCTION_AUTHORIZATION');
    expect(plan.status).not.toBe('READY_TO_RENDER');
  });
});

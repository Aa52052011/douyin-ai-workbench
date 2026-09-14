import { describe, expect, it } from 'vitest';
import { buildOutputSelection, LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from './dual-output.js';
import { buildDualProfileExecutionPlan, evaluateFinalTruthGate } from './final-readiness.js';
import {
  EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  EXPLICIT_VISUAL_APPROVAL_MESSAGE,
  authorizationIdentityFromPlan,
  bindProductionAuthorizationToPlan,
  bindVisualApprovalToPlan,
  createOrReuseProductionAuthorization,
  createOrReuseVisualApproval,
  identityFromPlan,
} from './visual-approval.js';
import {
  assertLiveProductionBindings,
  assertProductionSourcePath,
  buildLandscapeProductionFilter,
  buildVerticalProductionFilterGraph,
  consumeAuthorizationAfterDualRuns,
  decideProductionUsable,
  planStatusAfterRuns,
  validateProductionProbe,
  type ProductionExecutionRunV1,
} from './production-render.js';

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

function boundPlan() {
  const draft = buildDualProfileExecutionPlan({
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
  const approval = createOrReuseVisualApproval({
    phrase: EXPLICIT_VISUAL_APPROVAL_MESSAGE,
    approvalId: '2f6ed1e4-40f1-4376-9c47-44c2a457e5e0',
    tenantId: draft.tenantId,
    workspaceId: draft.workspaceId,
    projectId: draft.projectId,
    reviewSessionId: draft.reviewSessionId,
    productionPlanId: draft.planId,
    identity: identityFromPlan(draft),
    existing: null,
  }).approval;
  const withApproval = bindVisualApprovalToPlan(draft, approval);
  const authorization = createOrReuseProductionAuthorization({
    phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
    authorizationId: '0ef97db0-e070-4c6f-bd2a-6a9e34fbfdcc',
    executionPreparationId: 'prep-1',
    tenantId: draft.tenantId,
    workspaceId: draft.workspaceId,
    projectId: draft.projectId,
    reviewSessionId: draft.reviewSessionId,
    productionPlanId: draft.planId,
    identity: authorizationIdentityFromPlan(withApproval, approval.approvalId),
    approvalMatch: 'MATCH',
    existing: null,
  }).authorization;
  return { plan: bindProductionAuthorizationToPlan(withApproval, authorization), approval, authorization };
}

function run(partial: Partial<ProductionExecutionRunV1> & { profileId: string; status: ProductionExecutionRunV1['status'] }): ProductionExecutionRunV1 {
  return {
    schemaVersion: 'production.execution-run:v1',
    executionRunId: partial.executionRunId ?? `${partial.profileId}-run`,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    reviewSessionId: scope.reviewSessionId,
    inputRef: '/media/original.mp4',
    outputRef: null,
    startedAt: null,
    completedAt: null,
    configHash: 'hash',
    sourceAssetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
    visualApprovalId: '2f6ed1e4-40f1-4376-9c47-44c2a457e5e0',
    productionAuthorizationId: '0ef97db0-e070-4c6f-bd2a-6a9e34fbfdcc',
    productionPlanId: 'plan-1',
    truthGateRef: 'final.truth-gate:v1',
    restrictedClaims: ['C5', 'C6'],
    ffmpegCalls: 0,
    ffmpegExit: null,
    failureCode: null,
    ...partial,
  };
}

describe('B2-15M dual-profile production render contracts', () => {
  it('rejects preview and calibration paths as production source', () => {
    expect(() => assertProductionSourcePath('/x/review-preview/a.mp4')).toThrow('PREVIEW_AS_PRODUCTION_SOURCE');
    expect(() => assertProductionSourcePath('D:\\x\\.local\\source-aware-previews\\t\\s\\v.mp4')).toThrow(
      'PREVIEW_AS_PRODUCTION_SOURCE',
    );
    expect(() => assertProductionSourcePath('/x/V_1080x1920_crf18.mp4')).toThrow('CALIBRATION_AS_PRODUCTION_SOURCE');
    expect(() => assertProductionSourcePath('/x/mobile-aspect-calibration/content-01/L_1920x1080_crf18.mp4')).toThrow();
    expect(() => assertProductionSourcePath('/media/assets/803fafd2-4c0e-4412-80d7-a0d6452cefac.mp4')).not.toThrow();
  });

  it('validates frozen dual bindings without lifting C5/C6', () => {
    const bound = boundPlan();
    expect(() => assertLiveProductionBindings(bound)).not.toThrow();
    expect(evaluateFinalTruthGate().result).toBe('PASS_WITH_RESTRICTIONS');
    expect(bound.plan.restrictedClaims).toEqual(['C5', 'C6']);
    expect(() =>
      assertLiveProductionBindings({
        ...bound,
        plan: { ...bound.plan, sourceAssetId: 'other' },
      }),
    ).toThrow();
  });

  it('builds source-aware vertical and scale-to-fit landscape filters', () => {
    const vertical = buildVerticalProductionFilterGraph({
      segments: [
        {
          segmentId: 's1',
          sourceStartMs: 0,
          sourceEndMs: 1000,
          decision: 'WIDE_CONTEXT',
          compositionFrom: 'INITIAL_SMART_UI_FIT',
          reason: 'SMART_UI_FIT',
          integrityOk: true,
          fallback: 'NONE',
          normalizedCrop: { x: 0, y: 0, width: 1, height: 1 },
          fitMode: 'CONTAIN',
          backgroundTreatment: 'BLUR_SOURCE_DARKENED',
          narrationRefs: [],
        },
      ],
      sourceWidth: 1920,
      sourceHeight: 1040,
    });
    expect(vertical.filter).toContain('1080:1920');
    expect(vertical.filter).toContain('lanczos');
    expect(vertical.filter).not.toContain('720:1280');
    const landscape = buildLandscapeProductionFilter(1);
    expect(landscape.filter).toContain('1920:1080');
    expect(landscape.stretch).toBe(false);
  });

  it('does not consume authorization until both dual-plan profiles are terminal', () => {
    const verticalRunning = run({ profileId: VERTICAL_PROFILE_ID, status: 'COMPLETED', executionRunId: 'v1' });
    const landscapePending = run({ profileId: LANDSCAPE_PROFILE_ID, status: 'RUNNING', executionRunId: 'l1' });
    const mid = consumeAuthorizationAfterDualRuns({
      authorizationId: '0ef97db0-e070-4c6f-bd2a-6a9e34fbfdcc',
      tenantId: scope.tenantId,
      reviewSessionId: scope.reviewSessionId,
      productionPlanId: 'plan-1',
      vertical: verticalRunning,
      landscape: landscapePending,
    });
    expect(mid.status).toBe('NOT_CONSUMED');
    const done = consumeAuthorizationAfterDualRuns({
      authorizationId: '0ef97db0-e070-4c6f-bd2a-6a9e34fbfdcc',
      tenantId: scope.tenantId,
      reviewSessionId: scope.reviewSessionId,
      productionPlanId: 'plan-1',
      vertical: verticalRunning,
      landscape: { ...landscapePending, status: 'COMPLETED' },
    });
    expect(done.status).toBe('CONSUMED_FOR_DUAL_PLAN');
    expect(done.rule).toBe('ONE_AUTHORIZATION_COVERS_DUAL_PLAN_BOTH_PROFILES');
    expect(done.coversProfileIds).toEqual([VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID]);
  });

  it('keeps independent profile outcomes and productionUsable rules', () => {
    expect(planStatusAfterRuns('COMPLETED', 'FAILED')).toBe('PRODUCTION_PARTIAL');
    expect(planStatusAfterRuns('COMPLETED', 'COMPLETED')).toBe('PRODUCTION_COMPLETED');
    expect(
      decideProductionUsable({
        renderSuccess: true,
        artifactValid: true,
        probeOk: true,
        decodeOk: true,
        truthAcceptable: true,
        bindingsMatch: true,
        visualApproved: true,
        productionAuthorized: true,
      }),
    ).toBe(true);
    expect(
      decideProductionUsable({
        renderSuccess: true,
        artifactValid: true,
        probeOk: true,
        decodeOk: true,
        truthAcceptable: true,
        bindingsMatch: true,
        visualApproved: true,
        productionAuthorized: false,
      }),
    ).toBe(false);
    expect(
      validateProductionProbe({
        profileId: VERTICAL_PROFILE_ID,
        probe: {
          hasVideo: true,
          hasAudio: false,
          codec: 'h264',
          width: 1080,
          height: 1920,
          pix_fmt: 'yuv420p',
          fps: 30,
          durationSec: 35.1,
          bytes: 100_000,
        },
        expectedDurationMs: 35107,
        decodeOk: true,
      }).ok,
    ).toBe(true);
  });
});

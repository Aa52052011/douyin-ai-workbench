import { describe, expect, it } from 'vitest';
import { assembleContent01Clean } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../director-visual-policy/dryrun-assembler.js';
import { buildPreviewExecutionPlan } from '../crop-execution/execution-plan-builder.js';
import { CropApprovalPersistenceService } from './approval-persistence.js';
import { evaluateAuthorizedExecutionGate } from './authorization-gate.js';
import { executeAuthorizedCropPlan, upgradePreviewPlanToAuthorized, validateAuthorizedProductionPlan } from './authorized-runtime.js';
import {
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  CROP_REVIEW_PERSISTENCE_VERSION,
  type AuthorizationContext,
  type PersistedReviewSession,
  type TenantScope,
} from './persistence.types.js';
import { newId } from './memory-store.js';

const SCOPE: TenantScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
};

const OTHER: TenantScope = { ...SCOPE, tenantId: '55555555-5555-4555-8555-555555555555' };

const CTX: AuthorizationContext = {
  candidateEligible: true,
  hardBlocker: false,
  assetProductionEligible: true,
  truthPrivacyRightsPass: true,
  sessionStatus: 'APPROVED',
  sessionCandidateVersion: 'geom:crop:top-trim',
  sessionPreviewVersion: 'preview:runtime-1',
  sessionBackground: 'SOLID',
  sessionExpired: false,
};

function syntheticReady(overrides: Partial<PersistedReviewSession> = {}): PersistedReviewSession {
  const id = overrides.id ?? newId();
  return {
    schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
    id,
    tenantId: SCOPE.tenantId,
    workspaceId: SCOPE.workspaceId,
    projectId: SCOPE.projectId,
    assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    candidateId: 'crop:top-trim',
    candidateVersion: 'geom:crop:top-trim',
    reviewPacketVersion: 'crop.human-review-packet:v1',
    previewId: 'pv:synthetic',
    previewVersion: 'preview:runtime-1',
    status: 'READY_FOR_REVIEW',
    backgroundTreatment: 'SOLID',
    requiredWarningsJson: ['MOBILE_READABILITY_LOW'],
    checklistJson: [
      { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'PRODUCT_UI_READABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    ],
    humanDecision: 'NOT_REVIEWED',
    createdByUserId: SCOPE.userId,
    reviewedByUserId: null,
    expiresAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function content01Current(): PersistedReviewSession {
  return syntheticReady({
    id: newId(),
    assetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
    backgroundTreatment: 'UNRESOLVED',
    previewId: 'pv:b2-13a:runtime-1',
    status: 'READY_FOR_REVIEW',
    checklistJson: [
      { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'PRODUCT_UI_READABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    ],
  });
}

describe('B2-14 approval persistence + authorized runtime', () => {
  it('persists and reloads a review session; Content #1 remains unapproved', () => {
    const svc = new CropApprovalPersistenceService();
    const session = svc.persistSession(content01Current());
    const loaded = svc.getSession(session.id, SCOPE);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.humanDecision).toBe('NOT_REVIEWED');
    expect(loaded.value.backgroundTreatment).toBe('UNRESOLVED');
    const denied = svc.approve({
      scope: SCOPE,
      sessionId: session.id,
      clientActionId: 'c1-approve',
      approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [],
      previewId: session.previewId!,
      candidateEligible: true,
      hardBlocker: false,
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe('UNRESOLVED_BACKGROUND');
    expect(svc.getSession(session.id, SCOPE).ok && svc.getSession(session.id, SCOPE).ok).toBe(true);
    const again = svc.getSession(session.id, SCOPE);
    expect(again.ok && again.value.humanDecision).toBe('NOT_REVIEWED');
  });

  it('rejects forbidden sources, missing checklist, and cross-tenant reads', () => {
    const svc = new CropApprovalPersistenceService();
    const session = svc.persistSession(syntheticReady());
    expect(svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'sys', approvalSource: 'SYSTEM_INFERENCE',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    }).code).toBe('FORBIDDEN_SOURCE:SYSTEM_INFERENCE');
    expect(svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'dir', approvalSource: 'DIRECTOR_DRY_RUN',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    }).code).toBe('FORBIDDEN_SOURCE:DIRECTOR_DRY_RUN');
    expect(svc.getSession(session.id, OTHER).ok).toBe(false);
    const pending = svc.persistSession(syntheticReady({
      id: newId(),
      checklistJson: [{ id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' }],
    }));
    expect(svc.approve({
      scope: SCOPE, sessionId: pending.id, clientActionId: 'chk', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    }).code).toBe('MISSING_HUMAN_CHECKLIST');
  });

  it('persists immutable human approval idempotently and supports revoke/invalidate', () => {
    const svc = new CropApprovalPersistenceService();
    const session = svc.persistSession(syntheticReady());
    const first = svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'act-1', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: ['MOBILE_READABILITY_LOW'], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    const second = svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'act-1', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: ['MOBILE_READABILITY_LOW'], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    expect(first.ok && second.ok && first.value.id === second.value.id).toBe(true);
    if (!first.ok) return;
    expect(first.value.candidateId).toBe('crop:top-trim');
    expect(first.value.previewVersion).toBe('preview:runtime-1');
    const revoked = svc.revoke(first.value.id, SCOPE);
    expect(revoked.ok && revoked.value.status).toBe('REVOKED');
    const session2 = svc.persistSession(syntheticReady({ id: newId() }));
    const app2 = svc.approve({
      scope: SCOPE, sessionId: session2.id, clientActionId: 'act-2', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    expect(app2.ok).toBe(true);
    if (!app2.ok) return;
    const invalidated = svc.invalidateApproval(app2.value.id, SCOPE, 'CANDIDATE_CHANGED');
    expect(invalidated.ok && invalidated.value.status).toBe('INVALIDATED');
  });

  it('authorization requires ACTIVE human approval and rejects revoked/stale/no-approval', () => {
    const svc = new CropApprovalPersistenceService();
    const session = svc.persistSession(syntheticReady());
    const request = {
      schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
      approvalId: newId(),
      reviewSessionId: session.id,
      assetId: session.assetId,
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      previewVersion: session.previewVersion,
      backgroundTreatment: 'SOLID',
      executionPlanVersion: 'ffmpeg.crop-execution-plan:v1',
      clientRequestId: 'req-1',
    };
    expect(svc.authorize(request, SCOPE, CTX).ok).toBe(false);
    const approved = svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'act-auth', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const pass = svc.authorize({ ...request, approvalId: approved.value.id, clientRequestId: 'req-ok' }, SCOPE, CTX);
    expect(pass.ok).toBe(true);
    const again = svc.authorize({ ...request, approvalId: approved.value.id, clientRequestId: 'req-ok' }, SCOPE, CTX);
    expect(again.ok && pass.ok && again.value.id === pass.value.id).toBe(true);
    svc.revoke(approved.value.id, SCOPE);
    expect(svc.authorize({ ...request, approvalId: approved.value.id, clientRequestId: 'req-revoked' }, SCOPE, CTX).ok).toBe(false);
    const session3 = svc.persistSession(syntheticReady({ id: newId() }));
    const app3 = svc.approve({
      scope: SCOPE, sessionId: session3.id, clientActionId: 'act-3', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    if (!app3.ok) return;
    const stale = svc.authorize({
      ...request,
      approvalId: app3.value.id,
      reviewSessionId: session3.id,
      assetId: session3.assetId,
      previewVersion: 'preview:old',
      clientRequestId: 'req-stale',
    }, SCOPE, { ...CTX, sessionPreviewVersion: session3.previewVersion });
    expect(stale.ok).toBe(false);
  });

  it('rejects PREVIEW_ONLY production execute, accepts AUTHORIZED plan without spawning FFmpeg', () => {
    const pack = assembleContent01Clean();
    const generation = generateSemanticCropCandidates(pack);
    const evaluation = evaluateCropComparison(pack, generation);
    const dryRun = runCropSelectionDryRun(evaluation);
    const preview = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
    expect(executeAuthorizedCropPlan(preview).code).toBe('PREVIEW_ONLY_NOT_EXECUTABLE');
    const authorized = upgradePreviewPlanToAuthorized(preview, 'approval-synthetic', 'SOLID', preview.assetId);
    expect(authorized.target).toEqual({ width: 1080, height: 1920, aspectRatio: '9:16' });
    expect(authorized.crop).toEqual({ x: 0, y: 110, width: 1920, height: 930 });
    expect(validateAuthorizedProductionPlan(authorized).ok).toBe(true);
    const exec = executeAuthorizedCropPlan(authorized);
    expect(exec.accepted).toBe(true);
    expect(exec.ffmpegSpawned).toBe(false);
    expect(exec.cropExecutionCompleted).toBe(false);
    expect(exec.publishApproved).toBe(false);
  });

  it('execution run is idempotent, consumes authorization, and rejects revoked authorization', () => {
    const svc = new CropApprovalPersistenceService();
    const session = svc.persistSession(syntheticReady());
    const approved = svc.approve({
      scope: SCOPE, sessionId: session.id, clientActionId: 'act-run', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    if (!approved.ok) return;
    const authz = svc.authorize({
      schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
      approvalId: approved.value.id,
      reviewSessionId: session.id,
      assetId: session.assetId,
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      previewVersion: session.previewVersion,
      backgroundTreatment: 'SOLID',
      executionPlanVersion: 'ffmpeg.crop-execution-plan:v1',
      clientRequestId: 'exec-1',
    }, SCOPE, CTX);
    expect(authz.ok).toBe(true);
    if (!authz.ok) return;
    const run = svc.createExecutionRun(authz.value.id, SCOPE, 'run-1', `asset:${session.assetId}`);
    const run2 = svc.createExecutionRun(authz.value.id, SCOPE, 'run-1', `asset:${session.assetId}`);
    expect(run.ok && run2.ok && run.value.id === run2.value.id).toBe(true);
    expect(svc.store.getAuthorization(authz.value.id, SCOPE)?.status).toBe('CONSUMED');
    const session4 = svc.persistSession(syntheticReady({ id: newId() }));
    const app4 = svc.approve({
      scope: SCOPE, sessionId: session4.id, clientActionId: 'act-4', approvalSource: 'USER_UI_ACTION',
      acceptedWarnings: [], previewId: 'pv:synthetic', candidateEligible: true, hardBlocker: false,
    });
    if (!app4.ok) return;
    const authz2 = svc.authorize({
      schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
      approvalId: app4.value.id,
      reviewSessionId: session4.id,
      assetId: session4.assetId,
      candidateId: session4.candidateId,
      candidateVersion: session4.candidateVersion,
      previewVersion: session4.previewVersion,
      backgroundTreatment: 'SOLID',
      executionPlanVersion: 'ffmpeg.crop-execution-plan:v1',
      clientRequestId: 'exec-2',
    }, SCOPE, CTX);
    if (!authz2.ok) return;
    svc.store.putAuthorization({ ...authz2.value, status: 'REVOKED' });
    expect(svc.createExecutionRun(authz2.value.id, SCOPE, 'run-2', 'asset:x').code).toBe('AUTHORIZATION_REVOKED');
  });

  it('gate blocks unresolved background and blocked assets', () => {
    const gate = evaluateAuthorizedExecutionGate({
      ctx: { ...CTX, assetProductionEligible: false, hardBlocker: true },
      requestCandidateId: 'crop:top-trim',
      requestCandidateVersion: 'geom:crop:top-trim',
      requestPreviewVersion: 'preview:runtime-1',
      requestBackground: 'UNRESOLVED',
    });
    expect(gate.ok).toBe(false);
    expect(gate.errors).toEqual(expect.arrayContaining(['UNRESOLVED_BACKGROUND', 'ASSET_NOT_PRODUCTION_ELIGIBLE', 'HARD_BLOCKER']));
  });
});

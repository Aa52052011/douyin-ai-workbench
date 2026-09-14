import {
  CROP_APPROVAL_PERSISTENCE_VERSION,
  CROP_AUTHORIZED_RUNTIME_VERSION,
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  CROP_REVIEW_PERSISTENCE_VERSION,
  FORBIDDEN_AUTH_SOURCES,
  HUMAN_APPROVAL_SOURCES,
  type AuthorizedCropExecutionRequestV1,
  type AuthorizationContext,
  type InvalidationReason,
  type PersistResult,
  type PersistedAuthorization,
  type PersistedExecutionRun,
  type PersistedHumanApproval,
  type PersistedReviewSession,
  type TenantScope,
} from './persistence.types.js';
import { MemoryCropApprovalStore, newId } from './memory-store.js';
import { evaluateAuthorizedExecutionGate } from './authorization-gate.js';
import { HUMAN_REQUIRED_ITEMS } from '../crop-review-flow/review-flow.types.js';

export class CropApprovalPersistenceService {
  constructor(readonly store = new MemoryCropApprovalStore()) {}

  persistSession(input: Omit<PersistedReviewSession, 'schemaVersion' | 'createdAt' | 'updatedAt'> & { createdAt?: string }): PersistedReviewSession {
    const now = input.createdAt ?? '1970-01-01T00:00:00.000Z';
    const row: PersistedReviewSession = {
      ...input,
      schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    return this.store.putSession(row);
  }

  getSession(id: string, scope: TenantScope): PersistResult<PersistedReviewSession> {
    const row = this.store.getSession(id, scope);
    if (!row) return { ok: false, code: 'SESSION_NOT_FOUND_OR_FORBIDDEN', errors: ['SESSION_NOT_FOUND_OR_FORBIDDEN'] };
    return { ok: true, value: row };
  }

  approve(input: {
    scope: TenantScope;
    sessionId: string;
    clientActionId: string;
    approvalSource: string;
    acceptedWarnings: string[];
    previewId: string;
    candidateEligible: boolean;
    hardBlocker: boolean;
  }): PersistResult<PersistedHumanApproval> {
    const existing = this.store.findApprovalByClientAction(input.scope.tenantId, input.clientActionId);
    if (existing) return { ok: true, value: existing };
    const session = this.store.getSession(input.sessionId, input.scope);
    if (!session) return fail('SESSION_NOT_FOUND_OR_FORBIDDEN');
    if (FORBIDDEN_AUTH_SOURCES.includes(input.approvalSource as (typeof FORBIDDEN_AUTH_SOURCES)[number])) {
      return fail(`FORBIDDEN_SOURCE:${input.approvalSource}`);
    }
    if (!HUMAN_APPROVAL_SOURCES.includes(input.approvalSource as (typeof HUMAN_APPROVAL_SOURCES)[number])) {
      return fail('APPROVAL_SOURCE_NOT_HUMAN');
    }
    if (session.backgroundTreatment === 'UNRESOLVED') return fail('UNRESOLVED_BACKGROUND');
    if (!input.candidateEligible) return fail('INELIGIBLE_CANDIDATE');
    if (input.hardBlocker) return fail('HARD_BLOCKER');
    if (session.status === 'EXPIRED') return fail('SESSION_EXPIRED');
    if (session.status === 'INVALIDATED') return fail('SESSION_INVALIDATED');
    const pending = session.checklistJson.filter(
      (item) => HUMAN_REQUIRED_ITEMS.includes(item.id as (typeof HUMAN_REQUIRED_ITEMS)[number]) && item.interaction !== 'CONFIRMED_HUMAN',
    );
    if (pending.length) return fail('MISSING_HUMAN_CHECKLIST');
    if (!input.previewId || session.previewVersion.includes('placeholder')) {
      /* previewId still required */
    }
    if (!session.previewId && !input.previewId) return fail('PREVIEW_NOT_BOUND');
    const active = this.store.findActiveApprovalForSession(session.id, session.tenantId);
    if (active) return { ok: true, value: active };
    const approval: PersistedHumanApproval = {
      schemaVersion: CROP_APPROVAL_PERSISTENCE_VERSION,
      id: newId(),
      tenantId: session.tenantId,
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      reviewSessionId: session.id,
      assetId: session.assetId,
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      reviewPacketVersion: session.reviewPacketVersion,
      previewId: input.previewId || session.previewId || '',
      previewVersion: session.previewVersion,
      backgroundTreatment: session.backgroundTreatment,
      acceptedWarningsJson: [...input.acceptedWarnings],
      confirmedChecklistJson: session.checklistJson.filter((item) => item.interaction === 'CONFIRMED_HUMAN').map((item) => item.id),
      approvalSource: input.approvalSource,
      approvedByUserId: input.scope.userId,
      approvedAt: '1970-01-01T00:00:00.000Z',
      clientActionId: input.clientActionId,
      status: 'ACTIVE',
      invalidationReason: null,
      createdAt: '1970-01-01T00:00:00.000Z',
    };
    this.store.putApproval(approval);
    this.store.putSession({
      ...session,
      status: 'APPROVED',
      humanDecision: 'APPROVED',
      reviewedByUserId: input.scope.userId,
      updatedAt: '1970-01-01T00:00:00.000Z',
    });
    return { ok: true, value: approval };
  }

  revoke(approvalId: string, scope: TenantScope): PersistResult<PersistedHumanApproval> {
    const approval = this.store.getApproval(approvalId, scope);
    if (!approval) return fail('APPROVAL_NOT_FOUND_OR_FORBIDDEN');
    const revoked: PersistedHumanApproval = {
      ...approval,
      status: 'REVOKED',
      invalidationReason: 'MANUAL_REVOCATION',
    };
    this.store.putApproval(revoked);
    for (const authz of this.store.authorizations.values()) {
      if (authz.approvalId === approvalId && authz.status === 'ACTIVE') {
        this.store.putAuthorization({ ...authz, status: 'REVOKED' });
      }
    }
    return { ok: true, value: revoked };
  }

  invalidateApproval(approvalId: string, scope: TenantScope, reason: InvalidationReason): PersistResult<PersistedHumanApproval> {
    const approval = this.store.getApproval(approvalId, scope);
    if (!approval) return fail('APPROVAL_NOT_FOUND_OR_FORBIDDEN');
    const next: PersistedHumanApproval = { ...approval, status: 'INVALIDATED', invalidationReason: reason };
    this.store.putApproval(next);
    for (const authz of this.store.authorizations.values()) {
      if (authz.approvalId === approvalId && (authz.status === 'ACTIVE' || authz.status === 'CONSUMED')) {
        if (authz.status === 'ACTIVE') this.store.putAuthorization({ ...authz, status: 'INVALIDATED' });
      }
    }
    return { ok: true, value: next };
  }

  authorize(request: AuthorizedCropExecutionRequestV1, scope: TenantScope, ctx: AuthorizationContext): PersistResult<PersistedAuthorization> {
    const existing = this.store.findAuthorizationByClientRequest(scope.tenantId, request.clientRequestId);
    if (existing) return { ok: true, value: existing };
    const approval = this.store.getApproval(request.approvalId, scope);
    const session = this.store.getSession(request.reviewSessionId, scope);
    const gate = evaluateAuthorizedExecutionGate({
      approval,
      session,
      ctx,
      requestCandidateId: request.candidateId,
      requestCandidateVersion: request.candidateVersion,
      requestPreviewVersion: request.previewVersion,
      requestBackground: request.backgroundTreatment,
    });
    if (!gate.ok) return { ok: false, code: gate.errors[0] ?? 'AUTHORIZATION_REJECTED', errors: gate.errors };
    const row: PersistedAuthorization = {
      schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
      id: newId(),
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      approvalId: request.approvalId,
      reviewSessionId: request.reviewSessionId,
      assetId: request.assetId,
      candidateId: request.candidateId,
      candidateVersion: request.candidateVersion,
      previewVersion: request.previewVersion,
      backgroundTreatment: request.backgroundTreatment,
      executionPlanVersion: request.executionPlanVersion,
      clientRequestId: request.clientRequestId,
      status: 'ACTIVE',
      createdAt: '1970-01-01T00:00:00.000Z',
      consumedAt: null,
    };
    this.store.putAuthorization(row);
    return { ok: true, value: row };
  }

  createExecutionRun(authorizationId: string, scope: TenantScope, clientRequestId: string, inputRef: string): PersistResult<PersistedExecutionRun> {
    const existing = this.store.findRunByClientRequest(scope.tenantId, clientRequestId);
    if (existing) return { ok: true, value: existing };
    const authz = this.store.getAuthorization(authorizationId, scope);
    if (!authz) return fail('AUTHORIZATION_NOT_FOUND_OR_FORBIDDEN');
    if (authz.status === 'REVOKED' || authz.status === 'INVALIDATED') return fail(`AUTHORIZATION_${authz.status}`);
    if (authz.status === 'CONSUMED') return fail('AUTHORIZATION_CONSUMED');
    const run: PersistedExecutionRun = {
      schemaVersion: CROP_AUTHORIZED_RUNTIME_VERSION,
      id: newId(),
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      approvalId: authz.approvalId,
      authorizationId: authz.id,
      assetId: authz.assetId,
      candidateId: authz.candidateId,
      clientRequestId,
      status: 'PENDING',
      inputRef,
      tempOutputRef: `production-derived:${authz.assetId}/tmp.mp4`,
      finalOutputRef: null,
      ffmpegExitCode: null,
      validationJson: null,
      failureCode: null,
      failureMessageSanitized: null,
      startedAt: null,
      completedAt: null,
    };
    this.store.putAuthorization({ ...authz, status: 'CONSUMED', consumedAt: '1970-01-01T00:00:00.000Z' });
    this.store.putRun(run);
    return { ok: true, value: run };
  }

  markRunRunning(runId: string, scope: TenantScope) {
    const run = this.store.getRun(runId, scope);
    if (!run) return fail('RUN_NOT_FOUND');
    return { ok: true as const, value: this.store.putRun({ ...run, status: 'RUNNING', startedAt: '1970-01-01T00:00:00.000Z' }) };
  }

  markRunFailed(runId: string, scope: TenantScope, code: string) {
    const run = this.store.getRun(runId, scope);
    if (!run) return fail('RUN_NOT_FOUND');
    return { ok: true as const, value: this.store.putRun({ ...run, status: 'FAILED', failureCode: code, completedAt: '1970-01-01T00:00:00.000Z' }) };
  }
}

function fail(code: string): PersistResult<never> {
  return { ok: false, code, errors: [code] };
}

import type { HumanApprovedCropDecisionV1 } from '../crop-execution/human-approval.types.js';
import { CROP_HUMAN_APPROVAL_VERSION } from '../crop-execution/human-approval.types.js';
import type { BackgroundTreatment } from '../crop-execution/execution-plan.types.js';
import { evaluatePreviewRenderGate, isSelectableBackground } from './preview-render-gate.js';
import { assertScope, bumpPreviewVersion, cloneSession, createReviewSession } from './session-factory.js';
import {
  CROP_HUMAN_APPROVAL_COMMAND_VERSION,
  CROP_PREVIEW_RENDER_PLAN_VERSION,
  HUMAN_REQUIRED_ITEMS,
  type CropPreviewRenderPlanV1,
  type CropReviewSessionV1,
  type FlowResult,
  type HumanCropApprovalCommandV1,
  type ReviewFlowContext,
  type TenantScope,
} from './review-flow.types.js';
import { approveButtonState, buildReviewUiModel } from './ui-model.js';

export class CropReviewFlowEngine {
  private readonly sessions = new Map<string, CropReviewSessionV1>();
  private readonly contexts = new Map<string, ReviewFlowContext>();
  private readonly approvalsByAction = new Map<string, FlowResult>();
  private readonly previewPlans = new Map<string, CropPreviewRenderPlanV1>();

  create(input: { sessionId: string; scope: TenantScope; ctx: ReviewFlowContext; candidateVersion: string; createdAt?: string }): FlowResult {
    const session = createReviewSession({
      sessionId: input.sessionId,
      scope: input.scope,
      packet: input.ctx.packet,
      candidateVersion: input.candidateVersion,
      createdAt: input.createdAt,
    });
    this.sessions.set(session.sessionId, session);
    this.contexts.set(session.sessionId, input.ctx);
    return this.wrap(session);
  }

  get(sessionId: string, scope: TenantScope): FlowResult {
    const session = this.require(sessionId);
    const cross = assertScope(session, scope);
    if (cross) return { ok: false, code: cross, errors: [cross], session, ui: buildReviewUiModel(session, this.ctx(sessionId)) };
    return this.wrap(session);
  }

  /** Opening the review page — never an approval. */
  openPage(sessionId: string, scope: TenantScope): FlowResult {
    return this.get(sessionId, scope);
  }

  selectBackground(sessionId: string, scope: TenantScope, treatment: BackgroundTreatment): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    if (treatment !== 'UNRESOLVED' && !isSelectableBackground(treatment) && treatment !== 'AI_GENERATED') {
      return this.fail(session, 'INVALID_BACKGROUND');
    }
    session.backgroundTreatment = treatment;
    session.previewVersion = bumpPreviewVersion(session);
    session.previewId = null;
    session.previewStatus = treatment === 'UNRESOLVED' ? 'PLACEHOLDER_ONLY' : 'STALE';
    session.status = 'PREVIEW_PENDING';
    session.humanDecision = 'NOT_REVIEWED';
    const bgItem = session.requiredChecklist.find((item) => item.id === 'BACKGROUND_TREATMENT_ACCEPTABLE');
    if (bgItem && treatment === 'UNRESOLVED') bgItem.interaction = 'PENDING_HUMAN';
    if (bgItem && treatment !== 'UNRESOLVED') bgItem.interaction = 'PENDING_HUMAN';
    return this.wrap(session);
  }

  confirmChecklist(sessionId: string, scope: TenantScope, itemId: string): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    const item = session.requiredChecklist.find((entry) => entry.id === itemId);
    if (!item || item.kind !== 'HUMAN_CONFIRM_REQUIRED') return this.fail(session, 'CHECKLIST_NOT_HUMAN_REQUIRED');
    item.interaction = 'CONFIRMED_HUMAN';
    return this.wrap(session);
  }

  preparePreviewPlan(sessionId: string, scope: TenantScope): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    const ctx = this.ctx(sessionId);
    const eligible = ctx.eligible.some((item) => item.candidateId === session.candidateId);
    if (session.backgroundTreatment === 'UNRESOLVED') {
      session.previewStatus = 'PLACEHOLDER_ONLY';
      session.status = 'CREATED';
      const plan = this.makePlan(session, true);
      this.previewPlans.set(session.sessionId, plan);
      const gate = evaluatePreviewRenderGate({
        session,
        plan,
        assetBlocked: false,
        candidateEligible: eligible,
        geometryValid: true,
        hardBlocker: false,
      });
      return { ...this.wrap(session), previewPlan: plan, ok: gate.ok, errors: gate.errors };
    }
    session.previewId = `pv:${session.sessionId}:${session.previewVersion}`;
    session.previewStatus = 'READY';
    session.status = 'READY_FOR_REVIEW';
    const plan = this.makePlan(session, false);
    this.previewPlans.set(session.sessionId, plan);
    const gate = evaluatePreviewRenderGate({
      session,
      plan,
      assetBlocked: false,
      candidateEligible: eligible,
      geometryValid: true,
      hardBlocker: false,
    });
    if (!gate.ok) {
      session.previewStatus = 'FAILED';
      return { ...this.wrap(session), previewPlan: plan, ok: false, errors: gate.errors, code: 'PREVIEW_GATE_FAILED' };
    }
    return { ...this.wrap(session), previewPlan: plan };
  }

  approve(command: HumanCropApprovalCommandV1, scope: TenantScope): FlowResult {
    const existing = this.approvalsByAction.get(command.clientActionId);
    if (existing) return existing;
    const session = this.require(command.sessionId);
    const cross = assertScope(session, scope);
    if (cross) return { ok: false, code: cross, errors: [cross], session, ui: buildReviewUiModel(session, this.ctx(command.sessionId)) };
    if (command.schemaVersion !== CROP_HUMAN_APPROVAL_COMMAND_VERSION) return this.fail(session, 'INVALID_COMMAND_VERSION');
    if (command.explicitAction !== 'APPROVE') return this.fail(session, 'NOT_EXPLICIT_APPROVE');
    if (command.approvalSource !== 'USER_UI_ACTION') return this.fail(session, 'INVALID_APPROVAL_SOURCE');
    if (session.status === 'REJECTED') return this.fail(session, 'SESSION_REJECTED');
    if (session.status === 'CHANGES_REQUESTED') return this.fail(session, 'CHANGES_REQUESTED');
    if (session.status === 'EXPIRED') return this.fail(session, 'SESSION_EXPIRED');
    if (session.status === 'INVALIDATED') return this.fail(session, 'SESSION_INVALIDATED');
    if (command.previewVersion !== session.previewVersion || command.candidateVersion !== session.candidateVersion) {
      return this.fail(session, 'STALE_REVIEW_SESSION');
    }
    if (command.reviewPacketVersion !== session.reviewPacketVersion) return this.fail(session, 'STALE_REVIEW_PACKET');
    const ctx = this.ctx(session.sessionId);
    if (ctx.ineligible.some((item) => item.candidateId === command.candidateId)) {
      return this.fail(session, 'INELIGIBLE_CANDIDATE');
    }
    if (command.candidateId !== session.candidateId) return this.fail(session, 'CANDIDATE_MISMATCH');
    const option = ctx.eligible.find((item) => item.candidateId === command.candidateId);
    if (!option) return this.fail(session, 'INELIGIBLE_CANDIDATE');
    if (session.backgroundTreatment === 'UNRESOLVED' || command.backgroundTreatmentSelection === 'UNRESOLVED') {
      return this.fail(session, 'UNRESOLVED_BACKGROUND');
    }
    if (command.backgroundTreatmentSelection !== session.backgroundTreatment) return this.fail(session, 'BACKGROUND_MISMATCH');
    if (session.previewStatus !== 'READY') return this.fail(session, 'PREVIEW_NOT_READY');
    const pending = session.requiredChecklist.filter((item) => HUMAN_REQUIRED_ITEMS.includes(item.id) && item.interaction !== 'CONFIRMED_HUMAN');
    if (pending.length) return this.fail(session, 'MISSING_HUMAN_CHECKLIST');
    const gate = approveButtonState(session);
    if (!gate.enabled) return this.fail(session, gate.reason);
    const approval: HumanApprovedCropDecisionV1 = {
      schemaVersion: CROP_HUMAN_APPROVAL_VERSION,
      assetId: session.assetId,
      approvedCandidateId: session.candidateId,
      approvedStrategy: ctx.packet.dryRunStrategy ?? session.candidateId,
      approvalSource: 'USER_UI_ACTION',
      approvedAt: '1970-01-01T00:00:00.000Z',
      approvedByHuman: true,
      acceptedWarnings: [...command.acceptedWarnings],
      requestedAdjustments: [],
      evidenceRefs: [session.previewId ?? session.previewVersion],
      reviewChecklistRefs: session.requiredChecklist.filter((item) => item.interaction === 'CONFIRMED_HUMAN').map((item) => item.id),
      decisionVersion: `decision:${session.sessionId}:${session.previewVersion}`,
    };
    session.status = 'APPROVED';
    session.humanDecision = 'APPROVED';
    session.approvedDecision = { decisionVersion: approval.decisionVersion, previewVersion: session.previewVersion, candidateId: session.candidateId };
    session.productionExecutionEligibility = 'READY_FOR_AUTHORIZED_PLAN';
    const result = { ...this.wrap(session), approval };
    this.approvalsByAction.set(command.clientActionId, result);
    return result;
  }

  reject(sessionId: string, scope: TenantScope, reason: string): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    session.status = 'REJECTED';
    session.humanDecision = 'REJECTED';
    session.invalidationReason = reason;
    session.productionExecutionEligibility = 'BLOCKED';
    return this.wrap(session);
  }

  requestChanges(sessionId: string, scope: TenantScope, request: string): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    session.status = 'CHANGES_REQUESTED';
    session.humanDecision = 'REQUEST_CHANGES';
    session.invalidationReason = request;
    return this.wrap(session);
  }

  switchCandidate(sessionId: string, scope: TenantScope, candidateId: string): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    const ctx = this.ctx(sessionId);
    const next = ctx.eligible.find((item) => item.candidateId === candidateId);
    if (!next) return this.fail(session, 'INELIGIBLE_CANDIDATE');
    session.candidateId = next.candidateId;
    session.previewVersion = bumpPreviewVersion(session);
    session.previewId = null;
    session.previewStatus = 'STALE';
    session.status = 'PREVIEW_PENDING';
    session.backgroundTreatment = 'UNRESOLVED';
    session.humanDecision = 'NOT_REVIEWED';
    for (const item of session.requiredChecklist) {
      if (item.kind === 'HUMAN_CONFIRM_REQUIRED') item.interaction = 'PENDING_HUMAN';
    }
    return this.wrap(session);
  }

  invalidate(sessionId: string, reason: string): FlowResult {
    const session = this.require(sessionId);
    session.status = 'INVALIDATED';
    session.invalidationReason = reason;
    session.previewStatus = 'STALE';
    return this.wrap(session);
  }

  /** Smoke/runtime: preview file ready for humans to watch. Does not select background or approve. */
  attachSmokePreviewArtifact(sessionId: string, scope: TenantScope, input: { previewId: string; previewVersion: string }): FlowResult {
    const session = this.require(sessionId);
    const blocked = this.guardMutable(session, scope);
    if (blocked) return blocked;
    session.previewId = input.previewId;
    session.previewVersion = input.previewVersion;
    session.previewStatus = 'READY';
    session.status = 'READY_FOR_REVIEW';
    session.humanDecision = 'NOT_REVIEWED';
    session.approvedDecision = null;
    session.productionExecutionEligibility = 'NOT_READY';
    session.backgroundTreatment = 'UNRESOLVED';
    return this.wrap(session);
  }

  markPreviewFailed(sessionId: string, scope: TenantScope): FlowResult {
    const session = this.require(sessionId);
    const cross = assertScope(session, scope);
    if (cross) return { ok: false, code: cross, errors: [cross], session, ui: buildReviewUiModel(session, this.ctx(sessionId)) };
    session.previewStatus = 'FAILED';
    session.status = 'PREVIEW_PENDING';
    session.humanDecision = 'NOT_REVIEWED';
    session.approvedDecision = null;
    session.productionExecutionEligibility = 'NOT_READY';
    return this.wrap(session);
  }

  private makePlan(session: CropReviewSessionV1, placeholder: boolean): CropPreviewRenderPlanV1 {
    return {
      schemaVersion: CROP_PREVIEW_RENDER_PLAN_VERSION,
      mode: 'PREVIEW_REVIEW_ONLY',
      previewId: session.previewId ?? `placeholder:${session.sessionId}`,
      previewVersion: session.previewVersion,
      assetId: session.assetId,
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      geometry: this.ctx(session.sessionId).packet.geometry,
      target: { width: 720, height: 1280, aspectRatio: '9:16' },
      backgroundTreatment: session.backgroundTreatment,
      audioPolicy: 'MUTE_SOURCE_AUDIO',
      previewQuality: 'REVIEW_720p',
      watermarkOrMarker: 'REVIEW PREVIEW',
      outputRef: `review-preview/${session.sessionId}/${session.previewVersion}.mp4`,
      expiresAt: session.expiresAt,
      productionUsable: false,
      previewOnly: true,
      productionExecutionAllowed: false,
      ffmpegPreviewCalls: 0,
    };
  }

  private require(sessionId: string): CropReviewSessionV1 {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    return session;
  }

  private ctx(sessionId: string): ReviewFlowContext {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) throw new Error('CONTEXT_NOT_FOUND');
    return ctx;
  }

  private wrap(session: CropReviewSessionV1): FlowResult {
    return { ok: true, errors: [], session: cloneSession(session), ui: buildReviewUiModel(session, this.ctx(session.sessionId)) };
  }

  private fail(session: CropReviewSessionV1, code: string): FlowResult {
    return { ok: false, code, errors: [code], session: cloneSession(session), ui: buildReviewUiModel(session, this.ctx(session.sessionId)) };
  }

  private guardMutable(session: CropReviewSessionV1, scope: TenantScope): FlowResult | null {
    const cross = assertScope(session, scope);
    if (cross) return { ok: false, code: cross, errors: [cross], session: cloneSession(session), ui: buildReviewUiModel(session, this.ctx(session.sessionId)) };
    if (session.status === 'APPROVED') return this.fail(session, 'ALREADY_APPROVED');
    if (session.status === 'REJECTED') return this.fail(session, 'SESSION_REJECTED');
    if (session.status === 'CHANGES_REQUESTED') return this.fail(session, 'CHANGES_REQUESTED');
    if (session.status === 'EXPIRED') return this.fail(session, 'SESSION_EXPIRED');
    if (session.status === 'INVALIDATED') return this.fail(session, 'SESSION_INVALIDATED');
    return null;
  }
}

export function approvalCommandFromSession(session: CropReviewSessionV1, clientActionId: string, acceptedWarnings: string[]): HumanCropApprovalCommandV1 {
  return {
    schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
    sessionId: session.sessionId,
    assetId: session.assetId,
    candidateId: session.candidateId,
    candidateVersion: session.candidateVersion,
    reviewPacketVersion: session.reviewPacketVersion,
    previewRef: session.previewId ?? '',
    previewVersion: session.previewVersion,
    backgroundTreatmentSelection: session.backgroundTreatment,
    acceptedWarnings,
    explicitAction: 'APPROVE',
    clientActionId,
    approvalSource: 'USER_UI_ACTION',
  };
}

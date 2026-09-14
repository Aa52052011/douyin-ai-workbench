import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { evaluateAuthorizedExecutionGate } from './authorization-gate.js';
import { CropReviewPreviewRuntimeService } from './crop-review-preview-runtime.service.js';
import { DynamicPreviewRuntimeService } from '../dynamic-reframe/dynamic-preview-runtime.service.js';
import { EditorialPreviewRuntimeService } from '../editorial-shot-runtime/editorial-preview-runtime.service.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG, EDITORIAL_UAT_CHECKLIST } from '../editorial-shot-runtime/render-config.js';
import { openEditorialPreviewStream } from '../editorial-shot-runtime/store.js';
import { SourceAwarePreviewRuntimeService } from '../source-aware-preview/source-aware-preview-runtime.service.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG, SOURCE_AWARE_UAT_CHECKLIST } from '../source-aware-preview/render-config.js';
import { openSourceAwarePreviewStream } from '../source-aware-preview/store.js';
import { mapPlanToRuntimeTimeline } from '../source-aware-editorial/timeline.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG, DYNAMIC_UAT_CHECKLIST } from '../dynamic-reframe/render-config.js';
import { loadFrozenDynamicPlan } from '../dynamic-reframe/plan-io.js';
import { loadFrozenEditorialPlan } from '../editorial-shot-runtime/plan-io.js';
import { countDecisions, directSourceAwareEditorialPlan } from '../source-aware-editorial/director.js';
import { openDynamicPreviewStream } from '../dynamic-reframe/store.js';
import { PgCropReviewRepository } from './pg-repository.js';
import { PgOutputSelectionRepository } from '../source-aware-output/output-selection.repository.js';
import { FileExecutionPlanStore } from '../source-aware-output/execution-plan-store.js';
import { FileVisualApprovalStore } from '../source-aware-output/visual-approval-store.js';
import { FileProductionAuthorizationStore } from '../source-aware-output/production-authorization-store.js';
import { FileFinalProductionReviewStore } from '../source-aware-output/final-production-review-store.js';
import { buildFinalProductionReviewHttpView, productionMediaPathForProfile, assertFinalReviewSourcePath } from '../source-aware-output/final-production-review.js';
import { buildOutputSelectionHttpView } from '../source-aware-output/http-view.js';
import {
  buildDualProfileExecutionPlan,
  buildFinalReadinessHttpView,
} from '../source-aware-output/final-readiness.js';
import {
  authorizationIdentityFromPlan,
  identityFromPlan,
  matchApprovalToIdentity,
  matchAuthorizationToIdentity,
} from '../source-aware-output/visual-approval.js';
import { abstractPreviewRef, openPreviewStream } from './preview-media-store.js';
import { backgroundConfigForSession } from './preview-config.js';
import { bumpPacketVersion, bumpPreviewVersion, buildReviewHttpView, hardBlocked, pendingHuman } from './review-http-view.js';
import {
  CROP_APPROVAL_PERSISTENCE_VERSION,
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  FORBIDDEN_AUTH_SOURCES,
  HUMAN_APPROVAL_SOURCES,
  type AuthorizedCropExecutionRequestV1,
  type PersistedHumanApproval,
  type PersistedReviewSession,
} from './persistence.types.js';
import type { HumanCropApprovalCommandV1 } from '../crop-review-flow/review-flow.types.js';
import { HUMAN_REQUIRED_ITEMS } from '../crop-review-flow/review-flow.types.js';

export type DurableHttpResult<T> = { ok: true; value: T; sourceOfTruth: 'POSTGRES' } | { ok: false; code: string; errors: string[]; sourceOfTruth: 'POSTGRES' };

function fail<T>(code: string): DurableHttpResult<T> {
  return { ok: false, code, errors: [code], sourceOfTruth: 'POSTGRES' };
}

function scopeOk(session: PersistedReviewSession, auth: AuthContext, projectId?: string): string | null {
  if (session.workspaceId !== auth.workspaceId) return 'WORKSPACE_FORBIDDEN';
  if (projectId && projectId !== session.projectId) return 'PROJECT_FORBIDDEN';
  return null;
}

@Injectable()
export class DurableCropReviewHttpService {
  constructor(
    private readonly repo: PgCropReviewRepository,
    @Optional() private readonly previewRuntime?: CropReviewPreviewRuntimeService,
    @Optional() private readonly dynamicPreview?: DynamicPreviewRuntimeService,
    @Optional() private readonly editorialPreview?: EditorialPreviewRuntimeService,
    @Optional() private readonly sourceAwarePreview?: SourceAwarePreviewRuntimeService,
    @Optional() private readonly outputSelections?: PgOutputSelectionRepository,
    @Optional() private readonly executionPlans?: FileExecutionPlanStore,
    @Optional() private readonly visualApprovals?: FileVisualApprovalStore,
    @Optional() private readonly productionAuthorizations?: FileProductionAuthorizationStore,
    @Optional() private readonly finalProductionReviews?: FileFinalProductionReviewStore,
  ) {}

  async getReview(auth: AuthContext, sessionId: string, projectId?: string) {
    try {
      const session = await this.repo.getSession(sessionId, auth.tenantId);
      if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
      const scoped = scopeOk(session, auth, projectId);
      if (scoped === 'WORKSPACE_FORBIDDEN') throw new AppError(ErrorCode.WORKSPACE_FORBIDDEN);
      if (scoped === 'PROJECT_FORBIDDEN') throw new AppError(ErrorCode.PROJECT_FORBIDDEN);
      const reconciled = this.previewRuntime ? await this.previewRuntime.reconcileAndPersist(session) : { session, recon: null };
      const current = reconciled.session;
      const approval = await this.repo.getActiveApprovalForSession(current.id, current.tenantId);
      const outputSelection = this.outputSelections
        ? await this.outputSelections.getByReviewSession(current.tenantId, current.id)
        : null;
      const executionPlan = this.executionPlans
        ? await this.executionPlans.getByReviewSession(current.tenantId, current.id)
        : null;
      const visualApproval = this.visualApprovals
        ? await this.visualApprovals.getByReviewSession(current.tenantId, current.id)
        : null;
      const productionAuthorization = this.productionAuthorizations
        ? await this.productionAuthorizations.getByReviewSession(current.tenantId, current.id)
        : null;
      const finalProductionReview = this.finalProductionReviews
        ? await this.finalProductionReviews.getByReviewSession(current.tenantId, current.id)
        : null;
      const view = buildReviewHttpView({
        session: current,
        approval: approval ?? null,
        recon: reconciled.recon,
      });
      return this.withDynamicPreview(
        view,
        current,
        outputSelection,
        executionPlan,
        visualApproval,
        productionAuthorization,
        finalProductionReview,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw persistenceFailed();
    }
  }

  async approve(auth: AuthContext, sessionId: string, command: HumanCropApprovalCommandV1, projectId?: string): Promise<DurableHttpResult<{ approval: PersistedHumanApproval; session: PersistedReviewSession }>> {
    try {
      if (command.sessionId !== sessionId) return fail('SESSION_MISMATCH');
      if (command.explicitAction !== 'APPROVE') return fail('NOT_EXPLICIT_APPROVE');
      if (command.approvalSource !== 'USER_UI_ACTION') return fail('INVALID_APPROVAL_SOURCE');
      if (FORBIDDEN_AUTH_SOURCES.includes(command.approvalSource as never)) return fail(`FORBIDDEN_SOURCE:${command.approvalSource}`);
      if (!HUMAN_APPROVAL_SOURCES.includes(command.approvalSource)) return fail('APPROVAL_SOURCE_NOT_HUMAN');
      const existing = await this.repo.getApprovalByClientAction(auth.tenantId, command.clientActionId);
      if (existing) {
        const session = await this.repo.getSession(existing.reviewSessionId, auth.tenantId);
        if (!session) return fail('SESSION_NOT_FOUND_OR_FORBIDDEN');
        return { ok: true, sourceOfTruth: 'POSTGRES', value: { approval: existing, session } };
      }
      const session = await this.repo.getSession(sessionId, auth.tenantId);
      if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
      const scoped = scopeOk(session, auth, projectId);
      if (scoped) return fail(scoped);
      if (session.status === 'REJECTED') return fail('SESSION_REJECTED');
      if (session.status === 'CHANGES_REQUESTED') return fail('CHANGES_REQUESTED');
      if (session.status === 'EXPIRED') return fail('SESSION_EXPIRED');
      if (session.status === 'INVALIDATED') return fail('SESSION_INVALIDATED');
      if (session.status === 'APPROVED') {
        const active = await this.repo.getActiveApprovalForSession(session.id, session.tenantId);
        if (active) return { ok: true, sourceOfTruth: 'POSTGRES', value: { approval: active, session } };
        return fail('ALREADY_APPROVED');
      }
      if (command.candidateId !== session.candidateId) return fail('CANDIDATE_MISMATCH');
      if (command.candidateVersion !== session.candidateVersion) return fail('STALE_CANDIDATE_VERSION');
      if (command.previewVersion !== session.previewVersion) return fail('STALE_REVIEW_SESSION');
      if (command.reviewPacketVersion !== session.reviewPacketVersion) return fail('STALE_REVIEW_PACKET');
      if (command.backgroundTreatmentSelection !== session.backgroundTreatment) return fail('BACKGROUND_MISMATCH');
      if (session.backgroundTreatment === 'UNRESOLVED') return fail('UNRESOLVED_BACKGROUND');
      if (hardBlocked(session)) return fail('HARD_BLOCKER');
      if (pendingHuman(session)) return fail('MISSING_HUMAN_CHECKLIST');
      if (this.previewRuntime) {
        const { recon } = await this.previewRuntime.reconcileAndPersist(session);
        if (recon.failureCode === 'PREVIEW_ARTIFACT_MISSING' || recon.status === 'MISSING_ARTIFACT') return fail('PREVIEW_ARTIFACT_MISSING');
        if (recon.status !== 'READY') return fail('PREVIEW_NOT_READY');
        if (recon.placeholder) return fail('PLACEHOLDER_BACKGROUND_NOT_APPROVABLE');
        if (
          recon.sidecar &&
          (recon.sidecar.backgroundTreatment !== command.backgroundTreatmentSelection ||
            recon.sidecar.backgroundMode === 'SMOKE_PLACEHOLDER_SOLID_BLACK')
        ) {
          return fail(
            recon.sidecar.backgroundMode === 'SMOKE_PLACEHOLDER_SOLID_BLACK'
              ? 'PLACEHOLDER_BACKGROUND_NOT_APPROVABLE'
              : 'BACKGROUND_PREVIEW_MISMATCH',
          );
        }
      }
      const requiredWarnings = session.requiredWarningsJson;
      if (requiredWarnings.some((item) => !command.acceptedWarnings.includes(item))) return fail('WARNINGS_NOT_ACKNOWLEDGED');
      const draft: PersistedHumanApproval = {
        schemaVersion: CROP_APPROVAL_PERSISTENCE_VERSION,
        id: randomUUID(),
        tenantId: session.tenantId,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        reviewSessionId: session.id,
        assetId: session.assetId,
        candidateId: session.candidateId,
        candidateVersion: session.candidateVersion,
        reviewPacketVersion: session.reviewPacketVersion,
        previewId: command.previewRef || session.previewId || '',
        previewVersion: session.previewVersion,
        backgroundTreatment: session.backgroundTreatment,
        acceptedWarningsJson: [...command.acceptedWarnings],
        confirmedChecklistJson: session.checklistJson.filter((item) => item.interaction === 'CONFIRMED_HUMAN').map((item) => item.id),
        approvalSource: command.approvalSource,
        approvedByUserId: auth.userId,
        approvedAt: new Date().toISOString(),
        clientActionId: command.clientActionId,
        status: 'ACTIVE',
        invalidationReason: null,
        createdAt: new Date().toISOString(),
      };
      try {
        const approval = await this.repo.approveInTransaction(draft);
        const next = await this.repo.getSession(session.id, auth.tenantId);
        return { ok: true, sourceOfTruth: 'POSTGRES', value: { approval, session: next ?? session } };
      } catch (error) {
        if (this.repo.isUniqueViolation(error)) {
          const replay = await this.repo.getApprovalByClientAction(auth.tenantId, command.clientActionId);
          const next = await this.repo.getSession(session.id, auth.tenantId);
          if (replay && next) return { ok: true, sourceOfTruth: 'POSTGRES', value: { approval: replay, session: next } };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async reject(auth: AuthContext, sessionId: string, reason: string, projectId?: string) {
    try {
      const session = await this.repo.getSession(sessionId, auth.tenantId);
      if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
      const scoped = scopeOk(session, auth, projectId);
      if (scoped) return fail(scoped);
      if (session.status === 'APPROVED') return fail('ALREADY_APPROVED');
      if (session.status === 'REJECTED') {
        return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: session };
      }
      if (session.status === 'CHANGES_REQUESTED') return fail('CHANGES_REQUESTED');
      const next = await this.repo.updateSessionTerminal(session.id, session.tenantId, {
        status: 'REJECTED',
        humanDecision: 'REJECTED',
        reviewedByUserId: auth.userId,
        reason,
      });
      return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: next ?? session };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async requestChanges(auth: AuthContext, sessionId: string, request: string, projectId?: string) {
    try {
      const session = await this.repo.getSession(sessionId, auth.tenantId);
      if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
      const scoped = scopeOk(session, auth, projectId);
      if (scoped) return fail(scoped);
      if (session.status === 'APPROVED') return fail('ALREADY_APPROVED');
      if (session.status === 'REJECTED') return fail('SESSION_REJECTED');
      if (session.status === 'CHANGES_REQUESTED') {
        return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: session };
      }
      const next = await this.repo.updateSessionTerminal(session.id, session.tenantId, {
        status: 'CHANGES_REQUESTED',
        humanDecision: 'REQUEST_CHANGES',
        reviewedByUserId: auth.userId,
        reason: request,
      });
      return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: next ?? session };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async authorize(auth: AuthContext, sessionId: string, body: AuthorizedCropExecutionRequestV1, projectId?: string) {
    try {
      if (body.reviewSessionId && body.reviewSessionId !== sessionId) return fail('SESSION_MISMATCH');
      const existing = await this.repo.getAuthorizationByClientRequest(auth.tenantId, body.clientRequestId);
      if (existing) return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: existing, ffmpegSpawned: false as const };
      const session = await this.repo.getSession(sessionId, auth.tenantId);
      if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
      const scoped = scopeOk(session, auth, projectId);
      if (scoped) return fail(scoped);
      const approval = await this.repo.getApproval(body.approvalId, auth.tenantId);
      const dbCandidateId = approval?.candidateId ?? session.candidateId;
      const dbCandidateVersion = approval?.candidateVersion ?? session.candidateVersion;
      const dbPreviewVersion = approval?.previewVersion ?? session.previewVersion;
      const dbBackground = approval?.backgroundTreatment ?? session.backgroundTreatment;
      if (body.candidateId && body.candidateId !== dbCandidateId) return fail('CANDIDATE_MISMATCH');
      if (body.candidateVersion && body.candidateVersion !== dbCandidateVersion) return fail('STALE_CANDIDATE_VERSION');
      if (body.previewVersion && body.previewVersion !== dbPreviewVersion) return fail('STALE_PREVIEW_VERSION');
      if (body.backgroundTreatment && body.backgroundTreatment !== dbBackground) return fail('BACKGROUND_MISMATCH');
      const gate = evaluateAuthorizedExecutionGate({
        approval: approval ?? undefined,
        session,
        ctx: {
          candidateEligible: true,
          hardBlocker: hardBlocked(session),
          assetProductionEligible: !hardBlocked(session),
          truthPrivacyRightsPass: !hardBlocked(session),
          sessionStatus: session.status,
          sessionCandidateVersion: session.candidateVersion,
          sessionPreviewVersion: session.previewVersion,
          sessionBackground: session.backgroundTreatment,
          sessionExpired: false,
        },
        requestCandidateId: dbCandidateId,
        requestCandidateVersion: dbCandidateVersion,
        requestPreviewVersion: dbPreviewVersion,
        requestBackground: dbBackground,
      });
      if (!gate.ok) return { ok: false, code: gate.errors[0] ?? 'AUTHORIZATION_REJECTED', errors: gate.errors, sourceOfTruth: 'POSTGRES' as const };
      try {
        const row = await this.repo.insertAuthorization({
          schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
          id: randomUUID(),
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
          projectId: session.projectId,
          approvalId: approval!.id,
          reviewSessionId: session.id,
          assetId: session.assetId,
          candidateId: dbCandidateId,
          candidateVersion: dbCandidateVersion,
          previewVersion: dbPreviewVersion,
          backgroundTreatment: dbBackground,
          executionPlanVersion: body.executionPlanVersion || 'ffmpeg.crop-execution-plan:v1',
          clientRequestId: body.clientRequestId,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          consumedAt: null,
        });
        return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: row, ffmpegSpawned: false as const };
      } catch (error) {
        if (this.repo.isUniqueViolation(error)) {
          const replay = await this.repo.getAuthorizationByClientRequest(auth.tenantId, body.clientRequestId);
          if (replay) return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: replay, ffmpegSpawned: false as const };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async patchBackground(auth: AuthContext, sessionId: string, background: string, projectId?: string) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      const current = session.value;
      if (background === 'AI_GENERATED') return fail('BACKGROUND_UNAVAILABLE');
      if (background !== 'UNRESOLVED' && !['SOLID', 'BLUR_SOURCE', 'DUPLICATE_BLUR', 'STATIC_IMAGE'].includes(background)) {
        return fail('INVALID_BACKGROUND');
      }
      const next = await this.repo.updateSessionFields(current.id, current.tenantId, {
        backgroundTreatment: background,
        previewId: null,
        previewVersion: bumpPreviewVersion(current.previewVersion),
        status: 'PREVIEW_PENDING',
        humanDecision: 'NOT_REVIEWED',
        invalidationReason: 'BACKGROUND_CHANGED',
        reviewPacketVersion: bumpPacketVersion(current.reviewPacketVersion),
      });
      return {
        ok: true as const,
        sourceOfTruth: 'POSTGRES' as const,
        value: next,
        previewStatus: 'STALE' as const,
        ffmpegSpawned: false as const,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async patchChecklist(auth: AuthContext, sessionId: string, itemId: string, interaction: string, projectId?: string) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      const current = session.value;
      const list = current.checklistJson.length
        ? current.checklistJson.map((item) => ({ ...item }))
        : HUMAN_REQUIRED_ITEMS.map((id) => ({ id, interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' }));
      const item = list.find((entry) => entry.id === itemId);
      if (!item) return fail('CHECKLIST_ITEM_NOT_FOUND');
      if (item.kind !== 'HUMAN_CONFIRM_REQUIRED' || !HUMAN_REQUIRED_ITEMS.includes(item.id as (typeof HUMAN_REQUIRED_ITEMS)[number])) {
        return fail('CHECKLIST_NOT_HUMAN_REQUIRED');
      }
      if (['PASS_SYSTEM', 'WARNING_SYSTEM', 'FAILED'].includes(item.interaction) && interaction === 'CONFIRMED_HUMAN') {
        return fail('SYSTEM_CHECKLIST_LOCKED');
      }
      if (interaction !== 'CONFIRMED_HUMAN' && interaction !== 'PENDING_HUMAN') return fail('INVALID_CHECKLIST_INTERACTION');
      item.interaction = interaction;
      const next = await this.repo.updateSessionFields(current.id, current.tenantId, {
        checklistJson: list,
        reviewPacketVersion: bumpPacketVersion(current.reviewPacketVersion),
      });
      return { ok: true as const, sourceOfTruth: 'POSTGRES' as const, value: next };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async requestPreview(
    auth: AuthContext,
    sessionId: string,
    intent: 'REQUEST_RENDER' | 'ATTACH_SYNTHETIC_READY',
    projectId?: string,
    extras?: { clientRequestId?: string; solidColor?: string; staticImageAssetId?: string },
  ) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      const current = session.value;
      if (intent === 'ATTACH_SYNTHETIC_READY') {
        if (process.env.NODE_ENV !== 'test') return fail('PREVIEW_ATTACH_TEST_ONLY');
        const next = await this.repo.updateSessionFields(current.id, current.tenantId, {
          previewId: `pv:http-synthetic:${current.previewVersion}`,
          status: 'READY_FOR_REVIEW',
          invalidationReason: null,
        });
        return {
          ok: true as const,
          sourceOfTruth: 'POSTGRES' as const,
          value: next,
          previewStatus: 'READY' as const,
          ffmpegSpawned: false as const,
          regeneration: 'ATTACHED_WITHOUT_FFMPEG' as const,
        };
      }
      if (!this.previewRuntime) return fail('PREVIEW_RUNTIME_UNAVAILABLE');
      const cfg = backgroundConfigForSession(current.backgroundTreatment, {
        solidColor: extras?.solidColor,
        staticImageAssetId: extras?.staticImageAssetId,
      });
      if ('error' in cfg) return fail(cfg.error);
      if (cfg.type === 'STATIC_IMAGE' || cfg.type === 'DUPLICATE_BLUR' || cfg.type === 'AI_GENERATED') {
        return fail('BACKGROUND_UNSUPPORTED');
      }
      const storageKey = await this.repo.getAssetStorageKey(current.assetId, current.tenantId);
      if (!storageKey) return fail('PREVIEW_SOURCE_MISSING');
      const started = this.previewRuntime.render(current, extras ?? {}).catch(() => undefined);
      if (process.env.NODE_ENV === 'test') {
        const rendered = await started;
        if (rendered && !rendered.ok) return fail(rendered.code ?? 'FFMPEG_FAILED');
        if (rendered?.ok) {
          return {
            ok: true as const,
            sourceOfTruth: 'POSTGRES' as const,
            ffmpegSpawned: rendered.ffmpegSpawned,
            previewStatus: 'READY' as const,
            request: {
              status: rendered.ffmpegSpawned ? 'RENDERED' : 'IDEMPOTENT_READY',
              mode: 'PREVIEW_REVIEW_ONLY' as const,
              sessionId: rendered.session.id,
              candidateId: rendered.session.candidateId,
              backgroundTreatment: rendered.session.backgroundTreatment,
              previewVersion: rendered.session.previewVersion,
              abstractRef: abstractPreviewRef(rendered.session.id, rendered.session.previewVersion),
              productionUsable: false,
            },
            value: rendered.session,
          };
        }
      }
      const pending = await this.repo.getSession(current.id, current.tenantId);
      return {
        ok: true as const,
        sourceOfTruth: 'POSTGRES' as const,
        ffmpegSpawned: false as const,
        previewStatus: 'PREVIEW_PENDING' as const,
        request: {
          status: 'REQUESTED' as const,
          mode: 'PREVIEW_REVIEW_ONLY' as const,
          sessionId: current.id,
          candidateId: current.candidateId,
          backgroundTreatment: current.backgroundTreatment,
          previewVersion: pending?.previewVersion ?? current.previewVersion,
          abstractRef: abstractPreviewRef(current.id, pending?.previewVersion ?? current.previewVersion),
          productionUsable: false,
        },
        value: pending ?? current,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async openPreviewMedia(auth: AuthContext, sessionId: string, projectId?: string) {
    const session = await this.repo.getSession(sessionId, auth.tenantId);
    if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const scoped = scopeOk(session, auth, projectId);
    if (scoped === 'WORKSPACE_FORBIDDEN') throw new AppError(ErrorCode.WORKSPACE_FORBIDDEN);
    if (scoped === 'PROJECT_FORBIDDEN') throw new AppError(ErrorCode.PROJECT_FORBIDDEN);
    if (this.sourceAwarePreview) {
      const sourceAware = this.sourceAwarePreview.state(session.tenantId, session.id);
      if (sourceAware?.status === 'READY') {
        const stream = openSourceAwarePreviewStream({ tenantId: session.tenantId, sessionId: session.id });
        if (stream) return { ok: true as const, stream };
      }
      return { ok: false as const, code: sourceAware?.failureCode ?? 'PREVIEW_ARTIFACT_MISSING' };
    }
    if (this.editorialPreview) {
      const editorial = this.editorialPreview.state(session.tenantId, session.id);
      if (editorial?.status === 'READY') {
        const stream = openEditorialPreviewStream({ tenantId: session.tenantId, sessionId: session.id });
        if (stream) return { ok: true as const, stream };
      }
    }
    if (this.dynamicPreview) {
      const dyn = this.dynamicPreview.state(session.tenantId, session.id);
      if (dyn?.status === 'READY') {
        const stream = openDynamicPreviewStream({ tenantId: session.tenantId, sessionId: session.id });
        if (stream) return { ok: true as const, stream };
      }
    }
    if (this.previewRuntime) {
      const { recon, session: current } = await this.previewRuntime.reconcileAndPersist(session);
      if (recon.failureCode === 'PREVIEW_ARTIFACT_MISSING' || !recon.playable) {
        return { ok: false as const, code: recon.failureCode ?? 'PREVIEW_ARTIFACT_MISSING', session: current };
      }
    }
    const stream = openPreviewStream({
      tenantId: session.tenantId,
      sessionId: session.id,
      previewVersion: session.previewVersion,
      assetId: session.assetId,
    });
    if (!stream) return { ok: false as const, code: 'PREVIEW_ARTIFACT_MISSING' };
    return { ok: true as const, stream };
  }

  async openFinalProductionMedia(
    auth: AuthContext,
    sessionId: string,
    profile: string,
    projectId?: string,
  ) {
    const session = await this.repo.getSession(sessionId, auth.tenantId);
    if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const scoped = scopeOk(session, auth, projectId);
    if (scoped === 'WORKSPACE_FORBIDDEN') throw new AppError(ErrorCode.WORKSPACE_FORBIDDEN);
    if (scoped === 'PROJECT_FORBIDDEN') throw new AppError(ErrorCode.PROJECT_FORBIDDEN);
    if (profile !== 'vertical' && profile !== 'landscape') return { ok: false as const, code: 'UNKNOWN_PROFILE' };
    const filePath = productionMediaPathForProfile({
      repoRoot: process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd(),
      tenantId: session.tenantId,
      reviewSessionId: session.id,
      profile,
    });
    try {
      assertFinalReviewSourcePath(filePath);
    } catch {
      return { ok: false as const, code: 'NON_PRODUCTION_REJECTED_AS_FINAL' };
    }
    const { createReadStream, existsSync } = await import('node:fs');
    if (!existsSync(filePath)) return { ok: false as const, code: 'PRODUCTION_ARTIFACT_MISSING' };
    return { ok: true as const, stream: createReadStream(filePath) };
  }

  async requestSourceAwarePreview(auth: AuthContext, sessionId: string, projectId?: string) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      if (!this.sourceAwarePreview) return fail('PREVIEW_RUNTIME_UNAVAILABLE');
      const result = await this.sourceAwarePreview.requestRender({
        tenantId: session.value.tenantId,
        sessionId: session.value.id,
        assetId: session.value.assetId,
      });
      if (!result.ok) return fail(result.code ?? 'FFMPEG_FAILED');
      return {
        ok: true as const,
        sourceOfTruth: 'POSTGRES' as const,
        ffmpegSpawned: result.ffmpegSpawned,
        previewStatus: result.previewStatus,
        previewType: 'SOURCE_AWARE_SCREEN_RECORDING' as const,
        value: session.value,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async requestEditorialPreview(auth: AuthContext, sessionId: string, projectId?: string) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      if (!this.editorialPreview) return fail('PREVIEW_RUNTIME_UNAVAILABLE');
      const result = await this.editorialPreview.requestRender({
        tenantId: session.value.tenantId,
        sessionId: session.value.id,
        assetId: session.value.assetId,
      });
      if (!result.ok) return fail(result.code ?? 'FFMPEG_FAILED');
      return {
        ok: true as const,
        sourceOfTruth: 'POSTGRES' as const,
        ffmpegSpawned: result.ffmpegSpawned,
        previewStatus: result.previewStatus,
        previewType: 'EDITORIAL_SHOT' as const,
        value: session.value,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  async requestDynamicPreview(auth: AuthContext, sessionId: string, projectId?: string) {
    try {
      const session = await this.loadMutable(auth, sessionId, projectId);
      if (!session.ok) return session;
      if (!this.dynamicPreview) return fail('PREVIEW_RUNTIME_UNAVAILABLE');
      const result = await this.dynamicPreview.requestRender({
        tenantId: session.value.tenantId,
        sessionId: session.value.id,
        assetId: session.value.assetId,
      });
      if (!result.ok) return fail(result.code ?? 'FFMPEG_FAILED');
      return {
        ok: true as const,
        sourceOfTruth: 'POSTGRES' as const,
        ffmpegSpawned: result.ffmpegSpawned,
        previewStatus: result.previewStatus,
        previewType: 'DYNAMIC_REFRAME' as const,
        value: session.value,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('PERSISTENCE_FAILED');
    }
  }

  private withDynamicPreview<T extends Record<string, unknown>>(
    view: T,
    session: PersistedReviewSession,
    outputSelection: Awaited<ReturnType<PgOutputSelectionRepository['getByReviewSession']>> = null,
    storedPlan: Awaited<ReturnType<FileExecutionPlanStore['getByReviewSession']>> = null,
    storedVisualApproval: Awaited<ReturnType<FileVisualApprovalStore['getByReviewSession']>> = null,
    storedProductionAuthorization: Awaited<ReturnType<FileProductionAuthorizationStore['getByReviewSession']>> = null,
    storedFinalReview: Awaited<ReturnType<FileFinalProductionReviewStore['getByReviewSession']>> = null,
  ) {
    const dyn = this.dynamicPreview?.state(session.tenantId, session.id) ?? null;
    const editorialSidecar = this.editorialPreview?.state(session.tenantId, session.id) ?? null;
    const plan = (() => {
      try {
        return loadFrozenDynamicPlan();
      } catch {
        return null;
      }
    })();
    const editorialPlan = (() => {
      try {
        return loadFrozenEditorialPlan();
      } catch {
        return null;
      }
    })();
    const timeline =
      plan?.segments.map((item) => ({
        segmentId: item.segmentId,
        startMs: item.startMs,
        endMs: item.endMs,
        intent: item.intent,
        targetReadability: item.targetReadability,
        requestShotSplit: Boolean(item.requestShotSplit),
        warnings: item.warnings,
      })) ?? [];
    const editorialReady = editorialSidecar?.status === 'READY';
    const editorialStatus =
      editorialSidecar?.status === 'READY'
        ? 'READY_FOR_EDITORIAL_HUMAN_REVIEW'
        : editorialSidecar?.status === 'RENDERING'
          ? 'EDITORIAL_PREVIEW_RENDERING'
          : editorialSidecar?.status === 'FAILED'
            ? 'EDITORIAL_PREVIEW_FAILED'
            : 'EDITORIAL_PREVIEW_PENDING';
    const sourceAwareSidecar = this.sourceAwarePreview?.state(session.tenantId, session.id) ?? null;
    const sourceAwareRendering = Boolean(
      this.sourceAwarePreview?.isInFlight(session.id) || sourceAwareSidecar?.status === 'RENDERING',
    );
    const sourceAwareReady = sourceAwareSidecar?.status === 'READY';
    const sourceAwareStatus = sourceAwareReady
      ? 'READY_FOR_SOURCE_AWARE_HUMAN_REVIEW'
      : sourceAwareSidecar?.status === 'FAILED'
        ? 'SOURCE_AWARE_PREVIEW_FAILED'
        : sourceAwareRendering
          ? 'SOURCE_AWARE_PREVIEW_RENDERING'
          : 'SOURCE_AWARE_PREVIEW_PENDING';
    const sourceAwareRuntimeEnabled = Boolean(this.sourceAwarePreview);
    const sourceAwarePlan = (() => {
      try {
        return directSourceAwareEditorialPlan();
      } catch {
        return null;
      }
    })();
    const sourceAwareTimeline = sourceAwarePlan ? mapPlanToRuntimeTimeline(sourceAwarePlan) : null;
    const editorialRuntimeEnabled = Boolean(this.editorialPreview) && !sourceAwareRuntimeEnabled;
    const outputSelectionView = buildOutputSelectionHttpView({
      session,
      selection: outputSelection,
      sourceVisualType: sourceAwarePlan?.sourceVisualType ?? 'SCREEN_RECORDING_UI_DEMO',
      humanApproved: false,
      productionAuthorized: false,
    });
    const executionPlan =
      storedPlan ??
      buildDualProfileExecutionPlan({
        planId: 'ephemeral.waiting-visual-approval',
        tenantId: session.tenantId,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        reviewSessionId: session.id,
        sourceAssetId: session.assetId,
        selection: outputSelection,
        visualApproved: false,
        productionAuthorized: false,
      });
    const visualMatch =
      storedVisualApproval && executionPlan.profiles.length
        ? matchApprovalToIdentity(storedVisualApproval, identityFromPlan(executionPlan))
        : 'ABSENT';
    const visualApproved = visualMatch === 'MATCH';
    const authorizationMatch =
      visualApproved && storedProductionAuthorization && storedVisualApproval && executionPlan.profiles.length
        ? matchAuthorizationToIdentity(
            storedProductionAuthorization,
            authorizationIdentityFromPlan(executionPlan, storedVisualApproval.approvalId),
          )
        : 'ABSENT';
    const productionAuthorized = authorizationMatch === 'MATCH';
    const finalReadiness = buildFinalReadinessHttpView({
      selection: outputSelection,
      plan: executionPlan,
      visualApproved,
      visualApprovalId: visualApproved ? storedVisualApproval?.approvalId ?? null : null,
      productionAuthorized,
      productionAuthorizationId: productionAuthorized ? storedProductionAuthorization?.authorizationId ?? null : null,
    });
    const preview = ((view as unknown as { preview: Record<string, unknown> }).preview) ?? {};
    return {
      ...view,
      outputSelection: outputSelectionView,
      finalReadiness,
      finalProductionReview: buildFinalProductionReviewHttpView(storedFinalReview),
      preview: {
        ...preview,
        type: sourceAwareRuntimeEnabled
          ? 'SOURCE_AWARE_SCREEN_RECORDING'
          : editorialRuntimeEnabled
            ? 'EDITORIAL_SHOT'
            : preview.type,
        mediaUrl: `/production-v2/crop-review/${session.id}/preview-media`,
        version: sourceAwareReady
          ? sourceAwareSidecar.previewVersion
          : editorialReady
            ? editorialSidecar.previewVersion
            : preview.version,
        playable: sourceAwareRuntimeEnabled ? sourceAwareReady : editorialRuntimeEnabled ? editorialReady : preview.playable,
        width: 720,
        height: 1280,
        productionUsable: false,
        failureCode:
          sourceAwareSidecar?.status === 'FAILED'
            ? sourceAwareSidecar.failureCode
            : editorialSidecar?.status === 'FAILED'
              ? editorialSidecar.failureCode
              : preview.failureCode,
      },
      sourceAwarePreview: sourceAwareRuntimeEnabled
        ? {
            previewType: 'SOURCE_AWARE_SCREEN_RECORDING',
            status: sourceAwareStatus,
            previewVersion: sourceAwareSidecar?.previewVersion ?? SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewVersion,
            sourceVisualType: sourceAwarePlan?.sourceVisualType ?? 'SCREEN_RECORDING_UI_DEMO',
            directorPolicy: sourceAwarePlan?.defaultStrategy ?? 'WIDE_FIRST',
            reviewResolution: '720x1280',
            productionTargetResolution: '1080x1920',
            verticalProductionTarget: '1080x1920',
            landscapeProductionTarget: '1920x1080',
            universalFinalResolution: false,
            outputStrategy: outputSelectionView.outputStrategy,
            productionSourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
            previewUpscaleAllowed: false,
            productionUsable: false,
            planVersion: sourceAwarePlan?.schemaVersion ?? SOURCE_AWARE_PREVIEW_RENDER_CONFIG.planVersion,
            decisionCount: sourceAwareTimeline?.decisionCount ?? 0,
            keepCurrentCount: sourceAwareTimeline?.keepCurrentCount ?? 0,
            explicitReframeCount: sourceAwareTimeline?.explicitReframeCount ?? 0,
            timelineSegmentCount: sourceAwareTimeline?.timelineSegmentCount ?? 0,
            renderedShotCount: sourceAwareTimeline?.renderedShotCount ?? 0,
            currentDecision: sourceAwareTimeline?.segments[0]?.decision ?? 'WIDE_CONTEXT',
            reason: sourceAwareTimeline?.segments[0]?.reason ?? 'SMART_UI_FIT',
            semanticIntegrity: sourceAwareTimeline?.segments.every((item) => item.integrityOk) ? 'PASS' : 'FALLBACK',
            failureCode: sourceAwareSidecar?.failureCode ?? null,
            humanChecklist: SOURCE_AWARE_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })),
            humanReviewRequired: true,
            humanReviewDecision: 'PENDING_FOR_SOURCE_AWARE_PREVIEW',
            humanApproved: false,
            approvalObject: null,
            productionAuthorization: false,
            timingPrecision: 'ESTIMATED_ALIGNMENT',
            simulatorPrecision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW',
          }
        : null,
      dynamicReframe: {
        previewType: 'DYNAMIC_REFRAME',
        status:
          dyn?.status === 'READY'
            ? 'READY_FOR_HUMAN_REVIEW'
            : dyn?.status === 'RENDERING'
              ? 'DYNAMIC_PREVIEW_RENDERING'
              : dyn?.status === 'FAILED'
                ? 'DYNAMIC_PREVIEW_FAILED'
                : 'NOT_RENDERED',
        previewVersion: dyn?.previewVersion ?? DYNAMIC_PREVIEW_RENDER_CONFIG.previewVersion,
        reviewResolution: '720x1280',
        productionTargetResolution: '1080x1920',
        productionSourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
        previewUpscaleAllowed: false,
        planVersion: 'dynamic.reframe-plan:v1',
        segmentCount: plan?.segments.length ?? 0,
        runtimeShotCount: dyn?.runtimeShotCount ?? null,
        shotSplitApplied: dyn?.shotSplitApplied ?? false,
        background: dyn?.background ?? DYNAMIC_PREVIEW_RENDER_CONFIG.backgroundMode,
        limitations: timeline.flatMap((item) => item.warnings.filter((warning) => warning === 'TEXT_COVERAGE_SHORTFALL')),
        timeline,
        humanChecklist: DYNAMIC_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })),
        humanReviewRequired: true,
        archivedEvidenceOnly: true,
      },
      editorialPreview: {
        previewType: 'EDITORIAL_SHOT',
        status: editorialStatus,
        previewVersion: editorialSidecar?.previewVersion ?? EDITORIAL_PREVIEW_RENDER_CONFIG.previewVersion,
        reviewResolution: '720x1280',
        productionTargetResolution: '1080x1920',
        productionSourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
        previewUpscaleAllowed: false,
        productionUsable: false,
        planVersion: editorialPlan?.schemaVersion ?? 'editorial.shot-plan:v1',
        shotCount: editorialPlan?.shots.length ?? editorialSidecar?.shotCount ?? 0,
        wideCount: editorialSidecar?.wideCount ?? editorialPlan?.shots.filter((item) => item.shotScale === 'WIDE_CONTEXT').length ?? 0,
        mediumCount: editorialSidecar?.mediumCount ?? editorialPlan?.shots.filter((item) => item.shotScale === 'MEDIUM_FOCUS').length ?? 0,
        detailCount: editorialSidecar?.detailCount ?? editorialPlan?.shots.filter((item) => item.shotScale === 'DETAIL_READABLE').length ?? 0,
        failureCode: editorialSidecar?.failureCode ?? null,
        humanChecklist: EDITORIAL_UAT_CHECKLIST.map((id) => ({ id, interaction: 'PENDING_HUMAN' })),
        humanReviewRequired: true,
        humanReviewDecision: 'PENDING_FOR_EDITORIAL_PREVIEW',
        humanApproved: false,
        approvalObject: null,
        productionAuthorization: false,
        timingPrecision: 'ESTIMATED_ALIGNMENT',
        simulatorPrecision: 'APPROXIMATE_DOUYIN_MOBILE_VIEW',
      },
      editorialShotDirector: editorialPlan
        ? {
            planVersion: editorialPlan.schemaVersion,
            repairDirection: 'EDITORIAL_SHOT_HIERARCHY+NARRATION_ALIGNED_REFRAME+DOUYIN_MOBILE_VIEW_SIMULATION',
            humanReviewResult: 'REQUEST_CHANGES',
            ffmpegThisStep: editorialReady ? 1 : 0,
            priorDynamicPreview: 'dynamic-preview:runtime-1',
            priorDynamicPreviewRole: 'FAILED_EDITORIAL_HIERARCHY_EVIDENCE',
            simulator: editorialPlan.simulator,
            shotCount: editorialPlan.shots.length,
            shots: editorialPlan.shots.map((item) => ({
              shotId: item.shotId,
              startMs: item.sourceStartMs,
              endMs: item.sourceEndMs,
              shotScale: item.shotScale,
              intent: item.intent,
              narrationUnitRef: item.narrationUnitRefs[0] ?? null,
              claimRefs: item.claimRefs,
              readabilityTarget: item.readabilityTarget,
              backgroundTreatment: item.backgroundTreatment,
              shotPurpose: item.shotPurpose,
              contextRecoveryReason: item.contextRecoveryReason ?? null,
              warnings: item.warnings,
            })),
            warnings: editorialPlan.warnings,
            humanFeedbackPreserved: editorialPlan.humanFeedbackPreserved,
          }
        : null,
      sourceAwareEditorial: (() => {
        try {
          const next = directSourceAwareEditorialPlan();
          const counts = countDecisions(next);
          return {
            planVersion: next.schemaVersion,
            sourceVisualType: next.sourceVisualType,
            defaultStrategy: next.defaultStrategy,
            mediumIsDefault: next.mediumIsDefault,
            shotQuota: next.shotQuota,
            shotCount: counts.shotCount,
            wideCount: counts.wide,
            mediumCount: counts.medium,
            detailCount: counts.detail,
            keepCurrentCount: counts.keep,
            previewThisStep: true,
            humanReviewResult: 'REQUEST_CHANGES',
          };
        } catch {
          return null;
        }
      })(),
    };
  }

  private async loadMutable(
    auth: AuthContext,
    sessionId: string,
    projectId?: string,
  ): Promise<{ ok: true; value: PersistedReviewSession } | { ok: false; code: string; errors: string[]; sourceOfTruth: 'POSTGRES' }> {
    const session = await this.repo.getSession(sessionId, auth.tenantId);
    if (!session) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const scoped = scopeOk(session, auth, projectId);
    if (scoped) return fail(scoped);
    if (session.status === 'APPROVED') return fail('ALREADY_APPROVED');
    if (session.status === 'REJECTED') return fail('SESSION_REJECTED');
    if (session.status === 'CHANGES_REQUESTED') return fail('CHANGES_REQUESTED');
    if (session.status === 'EXPIRED') return fail('SESSION_EXPIRED');
    if (session.status === 'INVALIDATED') return fail('SESSION_INVALIDATED');
    return { ok: true, value: session };
  }
}

function persistenceFailed(): AppError {
  return new AppError(ErrorCode.AGENT_EXECUTION_FAILED);
}

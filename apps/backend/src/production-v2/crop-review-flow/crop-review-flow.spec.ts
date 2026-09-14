import { describe, expect, it } from 'vitest';
import { HUMAN_REQUIRED_ITEMS } from './review-flow.types.js';
import { approvalCommandFromSession } from './review-flow-engine.js';
import { CONTENT01_SCOPE, startContent01Session } from './content01-review.fixture.js';
import { VISIBLE_WARNINGS } from './review-flow.types.js';

function reachReady(engine: ReturnType<typeof startContent01Session>['engine'], sessionId: string) {
  engine.selectBackground(sessionId, CONTENT01_SCOPE, 'BLUR_SOURCE');
  return engine.preparePreviewPlan(sessionId, CONTENT01_SCOPE);
}

function confirmAll(engine: ReturnType<typeof startContent01Session>['engine'], sessionId: string) {
  for (const id of HUMAN_REQUIRED_ITEMS) {
    engine.confirmChecklist(sessionId, CONTENT01_SCOPE, id);
  }
}

describe('B2-13 crop review session + approval flow', () => {
  it('starts with TOP_TRIM, unresolved background, disabled approve, not reviewed', () => {
    const { result } = startContent01Session();
    expect(result.session.candidateId).toBe('crop:top-trim');
    expect(result.session.backgroundTreatment).toBe('UNRESOLVED');
    expect(result.session.previewStatus).toBe('PLACEHOLDER_ONLY');
    expect(result.session.humanDecision).toBe('NOT_REVIEWED');
    expect(result.session.approvedDecision).toBeNull();
    expect(result.ui.approveButton.enabled).toBe(false);
    expect(result.ui.autoApproveOnLoad).toBe(false);
    expect(result.ui.warningsDefaultAccepted).toBe(false);
    expect(result.ui.warnings).toEqual(expect.arrayContaining([...VISIBLE_WARNINGS]));
    expect(result.ui.ineligibleAlternatives.length).toBeGreaterThan(0);
    expect(result.ui.ineligibleAlternatives.every((item) => item.reason.includes('INELIGIBLE'))).toBe(true);
  });

  it('does not treat page open, preview ready, background, or checklist as approval', () => {
    const { engine, result } = startContent01Session();
    const opened = engine.openPage(result.session.sessionId, CONTENT01_SCOPE);
    expect(opened.session.humanDecision).toBe('NOT_REVIEWED');
    expect(opened.approval).toBeUndefined();
    engine.selectBackground(result.session.sessionId, CONTENT01_SCOPE, 'BLUR_SOURCE');
    const afterBg = engine.get(result.session.sessionId, CONTENT01_SCOPE);
    expect(afterBg.session.humanDecision).toBe('NOT_REVIEWED');
    expect(afterBg.approval).toBeUndefined();
    const preview = engine.preparePreviewPlan(result.session.sessionId, CONTENT01_SCOPE);
    expect(preview.session.previewStatus).toBe('READY');
    expect(preview.previewPlan?.productionUsable).toBe(false);
    expect(preview.previewPlan?.previewOnly).toBe(true);
    expect(preview.session.humanDecision).toBe('NOT_REVIEWED');
    confirmAll(engine, result.session.sessionId);
    const afterChecks = engine.get(result.session.sessionId, CONTENT01_SCOPE);
    expect(afterChecks.session.humanDecision).toBe('NOT_REVIEWED');
    expect(afterChecks.ui.approveButton.enabled).toBe(true);
  });

  it('requires explicit approve action and binds candidate+preview versions', () => {
    const { engine, result } = startContent01Session();
    reachReady(engine, result.session.sessionId);
    confirmAll(engine, result.session.sessionId);
    const session = engine.get(result.session.sessionId, CONTENT01_SCOPE).session;
    const cmd = approvalCommandFromSession(session, 'act-1', [...VISIBLE_WARNINGS]);
    const approved = engine.approve(cmd, CONTENT01_SCOPE);
    expect(approved.ok).toBe(true);
    expect(approved.approval?.approvedByHuman).toBe(true);
    expect(approved.approval?.approvalSource).toBe('USER_UI_ACTION');
    expect(approved.approval?.approvedCandidateId).toBe('crop:top-trim');
    expect(approved.session.approvedDecision?.previewVersion).toBe(session.previewVersion);
    expect(approved.session.productionExecutionEligibility).toBe('READY_FOR_AUTHORIZED_PLAN');
  });

  it('rejects unresolved background, missing checklist, stale preview, and ineligible candidate', () => {
    const { engine, result } = startContent01Session();
    const session = result.session;
    const early = approvalCommandFromSession(session, 'act-early', []);
    expect(engine.approve(early, CONTENT01_SCOPE).code).toBe('UNRESOLVED_BACKGROUND');
    reachReady(engine, session.sessionId);
    const mid = engine.get(session.sessionId, CONTENT01_SCOPE).session;
    expect(engine.approve(approvalCommandFromSession(mid, 'act-mid', []), CONTENT01_SCOPE).code).toBe('MISSING_HUMAN_CHECKLIST');
    confirmAll(engine, session.sessionId);
    const ready = engine.get(session.sessionId, CONTENT01_SCOPE).session;
    engine.selectBackground(session.sessionId, CONTENT01_SCOPE, 'SOLID');
    const stale = { ...approvalCommandFromSession(ready, 'act-stale', [...VISIBLE_WARNINGS]) };
    expect(engine.approve(stale, CONTENT01_SCOPE).code).toBe('STALE_REVIEW_SESSION');
    const { engine: engine2, result: r2 } = startContent01Session(undefined, 'session-ineligible');
    reachReady(engine2, r2.session.sessionId);
    confirmAll(engine2, r2.session.sessionId);
    const s2 = engine2.get(r2.session.sessionId, CONTENT01_SCOPE).session;
    const ineligible = approvalCommandFromSession(s2, 'act-bad', [...VISIBLE_WARNINGS]);
    ineligible.candidateId = 'crop:center-cover';
    ineligible.candidateVersion = s2.candidateVersion;
    ineligible.previewVersion = s2.previewVersion;
    expect(engine2.approve(ineligible, CONTENT01_SCOPE).code).toBe('INELIGIBLE_CANDIDATE');
  });

  it('is idempotent, rejects after reject, and blocks request-changes sessions', () => {
    const { engine, result } = startContent01Session();
    reachReady(engine, result.session.sessionId);
    confirmAll(engine, result.session.sessionId);
    const session = engine.get(result.session.sessionId, CONTENT01_SCOPE).session;
    const cmd = approvalCommandFromSession(session, 'act-idem', [...VISIBLE_WARNINGS]);
    const a = engine.approve(cmd, CONTENT01_SCOPE);
    const b = engine.approve(cmd, CONTENT01_SCOPE);
    expect(a).toEqual(b);

    const { engine: e3, result: r3 } = startContent01Session(undefined, 'session-reject');
    e3.reject(r3.session.sessionId, CONTENT01_SCOPE, 'READABILITY_BAD');
    const rejectedSession = e3.get(r3.session.sessionId, CONTENT01_SCOPE).session;
    expect(rejectedSession.status).toBe('REJECTED');
    expect(e3.approve(approvalCommandFromSession(rejectedSession, 'act-after-reject', []), CONTENT01_SCOPE).code).toBe('SESSION_REJECTED');

    const { engine: e4, result: r4 } = startContent01Session(undefined, 'session-changes');
    e4.requestChanges(r4.session.sessionId, CONTENT01_SCOPE, 'TRY_ANOTHER_CANDIDATE');
    const afterChanges = e4.get(r4.session.sessionId, CONTENT01_SCOPE);
    expect(afterChanges.session.status).toBe('CHANGES_REQUESTED');
    expect(afterChanges.ui.approveButton.enabled).toBe(false);
  });

  it('forbids cross-tenant access and keeps preview non-production', () => {
    const { engine, result } = startContent01Session();
    const other = engine.openPage(result.session.sessionId, { ...CONTENT01_SCOPE, tenantId: 'other-tenant' });
    expect(other.ok).toBe(false);
    expect(other.code).toBe('CROSS_TENANT_FORBIDDEN');
    const preview = engine.preparePreviewPlan(result.session.sessionId, CONTENT01_SCOPE);
    expect(preview.previewPlan?.ffmpegPreviewCalls).toBe(0);
    expect(preview.previewPlan?.outputRef.startsWith('review-preview/')).toBe(true);
  });

  it('keeps smoke preview READY from authorizing when background stays unresolved', () => {
    const { engine, result } = startContent01Session(undefined, 'session-smoke-ready');
    const attached = engine.attachSmokePreviewArtifact(result.session.sessionId, CONTENT01_SCOPE, {
      previewId: 'pv:smoke',
      previewVersion: 'preview:runtime-1',
    });
    expect(attached.session.status).toBe('READY_FOR_REVIEW');
    expect(attached.session.previewStatus).toBe('READY');
    expect(attached.session.backgroundTreatment).toBe('UNRESOLVED');
    expect(attached.session.humanDecision).toBe('NOT_REVIEWED');
    expect(attached.session.approvedDecision).toBeNull();
    expect(attached.ui.approveButton.enabled).toBe(false);
    expect(attached.session.requiredChecklist.filter((item) => item.kind === 'HUMAN_CONFIRM_REQUIRED').every((item) => item.interaction === 'PENDING_HUMAN')).toBe(true);
  });
});

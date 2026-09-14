import {
  AUTHORIZED_BACKGROUNDS,
  FORBIDDEN_AUTH_SOURCES,
  HUMAN_APPROVAL_SOURCES,
  UNSUPPORTED_PRODUCTION_BACKGROUNDS,
  type AuthorizationContext,
  type PersistedHumanApproval,
  type PersistedReviewSession,
} from './persistence.types.js';

export type AuthorizedExecutionGateV1 = {
  ok: boolean;
  errors: string[];
  ruleIds: string[];
};

export function evaluateAuthorizedExecutionGate(input: {
  approval?: PersistedHumanApproval;
  session?: PersistedReviewSession;
  ctx: AuthorizationContext;
  requestCandidateId: string;
  requestCandidateVersion: string;
  requestPreviewVersion: string;
  requestBackground: string;
  sourceEqualsOutput?: boolean;
}): AuthorizedExecutionGateV1 {
  const errors: string[] = [];
  const { approval, session, ctx } = input;
  if (!approval) errors.push('APPROVAL_NOT_FOUND');
  else {
    if (approval.status !== 'ACTIVE') errors.push(`APPROVAL_${approval.status}`);
    if (FORBIDDEN_AUTH_SOURCES.includes(approval.approvalSource as (typeof FORBIDDEN_AUTH_SOURCES)[number])) {
      errors.push(`FORBIDDEN_SOURCE:${approval.approvalSource}`);
    }
    if (!HUMAN_APPROVAL_SOURCES.includes(approval.approvalSource as (typeof HUMAN_APPROVAL_SOURCES)[number])) {
      errors.push('APPROVAL_SOURCE_NOT_HUMAN');
    }
    if (!approval.approvedByUserId) errors.push('MISSING_APPROVED_BY_USER');
    if (approval.candidateId !== input.requestCandidateId) errors.push('CANDIDATE_MISMATCH');
    if (approval.candidateVersion !== input.requestCandidateVersion) errors.push('STALE_CANDIDATE_VERSION');
    if (approval.previewVersion !== input.requestPreviewVersion) errors.push('STALE_PREVIEW_VERSION');
    if (approval.backgroundTreatment !== input.requestBackground) errors.push('BACKGROUND_MISMATCH');
  }
  if (!session) errors.push('SESSION_NOT_FOUND');
  else {
    if (session.status !== 'APPROVED') errors.push('SESSION_NOT_APPROVED');
    if (session.candidateVersion !== input.requestCandidateVersion) errors.push('SESSION_CANDIDATE_VERSION_MISMATCH');
    if (session.previewVersion !== input.requestPreviewVersion) errors.push('SESSION_PREVIEW_VERSION_MISMATCH');
    if (session.backgroundTreatment !== input.requestBackground) errors.push('SESSION_BACKGROUND_MISMATCH');
  }
  if (ctx.sessionExpired) errors.push('SESSION_EXPIRED');
  if (!ctx.candidateEligible) errors.push('CANDIDATE_INELIGIBLE');
  if (ctx.hardBlocker) errors.push('HARD_BLOCKER');
  if (!ctx.assetProductionEligible) errors.push('ASSET_NOT_PRODUCTION_ELIGIBLE');
  if (!ctx.truthPrivacyRightsPass) errors.push('TRUTH_PRIVACY_RIGHTS_BLOCK');
  if (input.requestBackground === 'UNRESOLVED') errors.push('UNRESOLVED_BACKGROUND');
  if ((UNSUPPORTED_PRODUCTION_BACKGROUNDS as readonly string[]).includes(input.requestBackground)) {
    errors.push('BACKGROUND_NOT_SUPPORTED');
  }
  if (!(AUTHORIZED_BACKGROUNDS as readonly string[]).includes(input.requestBackground) && input.requestBackground !== 'UNRESOLVED') {
    if (!(UNSUPPORTED_PRODUCTION_BACKGROUNDS as readonly string[]).includes(input.requestBackground)) {
      errors.push('INVALID_BACKGROUND');
    }
  }
  if (input.sourceEqualsOutput) errors.push('SOURCE_OVERWRITE');
  return {
    ok: errors.length === 0,
    errors,
    ruleIds: ['AUTHZ_REQUIRES_ACTIVE_HUMAN_APPROVAL', 'AUTHZ_VERSION_BOUND', 'AUTHZ_NO_SELF_AUTHORIZE'],
  };
}

export function cannotSelfAuthorize(source: string): boolean {
  return FORBIDDEN_AUTH_SOURCES.includes(source as (typeof FORBIDDEN_AUTH_SOURCES)[number]) || source === 'PREVIEW_READY' || source === 'SYSTEM_DRY_RUN_SELECTION';
}

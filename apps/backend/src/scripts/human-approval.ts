export const INVALID_AUTOMATED_CONFIRMATION = 'INVALID_AUTOMATED_CONFIRMATION' as const;

/** Explicit product-user confirm. Missing header is treated as authenticated API (UI / e2e). */
export const ALLOWED_SCRIPT_APPROVAL_SOURCES = ['USER_UI', 'USER_API'] as const;

/** Never accepted for POST /scripts/:id/confirm in V1 (no auto-approval mode). */
export const BLOCKED_SCRIPT_APPROVAL_SOURCES = [
  'CURSOR',
  'AUTOMATION',
  'AGENT',
  'WORKER',
  'QUEUE',
  'TEST_HELPER',
] as const;

export type ScriptApprovalSource =
  | (typeof ALLOWED_SCRIPT_APPROVAL_SOURCES)[number]
  | (typeof BLOCKED_SCRIPT_APPROVAL_SOURCES)[number]
  | 'UNSPECIFIED';

export function parseScriptApprovalSource(raw: unknown): ScriptApprovalSource {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'UNSPECIFIED';
  }
  const value = raw.trim().toUpperCase().replace(/-/g, '_');
  if ((ALLOWED_SCRIPT_APPROVAL_SOURCES as readonly string[]).includes(value)) {
    return value as (typeof ALLOWED_SCRIPT_APPROVAL_SOURCES)[number];
  }
  if ((BLOCKED_SCRIPT_APPROVAL_SOURCES as readonly string[]).includes(value)) {
    return value as (typeof BLOCKED_SCRIPT_APPROVAL_SOURCES)[number];
  }
  return 'UNSPECIFIED';
}

export function isBlockedScriptApprovalSource(source: ScriptApprovalSource): boolean {
  return (BLOCKED_SCRIPT_APPROVAL_SOURCES as readonly string[]).includes(source);
}

export function isScriptEligibleForProduction(status: string | null | undefined): boolean {
  return status === 'CONFIRMED';
}

export type HumanReviewEvidence = {
  reviewStatus: 'PENDING' | 'COMPLETED';
  reviewer: 'NONE' | 'HUMAN';
  humanDecision: 'NOT_PROVIDED' | 'YES' | 'NO';
};

export type AutomatedScriptReview = {
  domainPurity?: 'PASS' | 'FAIL';
  truthGate?: 'PASS' | 'FAIL';
  capabilityReview?: 'PASS' | 'FAIL';
  overallPass?: boolean;
};

/** Automated scores must never be written as HUMAN / YES without a real user decision. */
export function buildHumanReviewEvidence(input?: {
  userDecision?: 'YES' | 'NO';
  reviewerClaim?: string;
}): HumanReviewEvidence {
  if (input?.userDecision === 'YES' || input?.userDecision === 'NO') {
    return {
      reviewStatus: 'COMPLETED',
      reviewer: 'HUMAN',
      humanDecision: input.userDecision,
    };
  }
  return {
    reviewStatus: 'PENDING',
    reviewer: 'NONE',
    humanDecision: 'NOT_PROVIDED',
  };
}

/** True when automated scores must not be treated as Human Review PASS. */
export function automatedReviewCannotSubstituteHuman(
  automated: AutomatedScriptReview | undefined,
  human: HumanReviewEvidence,
): boolean {
  void automated;
  return human.humanDecision === 'NOT_PROVIDED' || human.reviewer !== 'HUMAN';
}

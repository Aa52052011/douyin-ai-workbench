export const CROP_HUMAN_APPROVAL_VERSION = 'crop.human-approval:v1' as const;

export const APPROVAL_SOURCES = ['USER_UI_ACTION', 'EXPLICIT_USER_MESSAGE'] as const;
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number];

export const FORBIDDEN_APPROVAL_SOURCES = ['SYSTEM_INFERENCE', 'AUTOMATED_REVIEW', 'DIRECTOR_DRY_RUN'] as const;

export type HumanApprovedCropDecisionV1 = {
  schemaVersion: typeof CROP_HUMAN_APPROVAL_VERSION;
  assetId: string;
  approvedCandidateId: string;
  approvedStrategy: string;
  approvalSource: ApprovalSource | (typeof FORBIDDEN_APPROVAL_SOURCES)[number] | string;
  approvedAt: string;
  approvedByHuman: boolean;
  acceptedWarnings: string[];
  requestedAdjustments: string[];
  evidenceRefs: string[];
  reviewChecklistRefs: string[];
  decisionVersion: string;
  hardBlockOverrideAttempt?: boolean;
};

export type HumanApprovalValidationResult = {
  ok: boolean;
  errors: string[];
  ruleIds: string[];
};

export const CROP_REVIEW_PERSISTENCE_VERSION = 'crop.review-persistence:v1' as const;
export const CROP_APPROVAL_PERSISTENCE_VERSION = 'crop.approval-persistence:v1' as const;
export const CROP_EXECUTION_AUTHORIZATION_VERSION = 'crop.execution-authorization:v1' as const;
export const CROP_AUTHORIZED_RUNTIME_VERSION = 'crop.authorized-runtime:v1' as const;

export const HUMAN_APPROVAL_SOURCES = ['USER_UI_ACTION', 'EXPLICIT_USER_MESSAGE'] as const;
export const FORBIDDEN_AUTH_SOURCES = ['SYSTEM_INFERENCE', 'DIRECTOR_DRY_RUN', 'AUTOMATED_REVIEW'] as const;
export const AUTHORIZED_BACKGROUNDS = ['SOLID', 'BLUR_SOURCE', 'DUPLICATE_BLUR', 'STATIC_IMAGE'] as const;
export const UNSUPPORTED_PRODUCTION_BACKGROUNDS = ['AI_GENERATED', 'TRANSPARENT_IF_SUPPORTED'] as const;

export const INVALIDATION_REASONS = [
  'CANDIDATE_CHANGED',
  'CANDIDATE_SAFETY_CHANGED',
  'PREVIEW_CHANGED',
  'BACKGROUND_CHANGED',
  'TRUTH_CONTEXT_CHANGED',
  'ASSET_BLOCKED',
  'SESSION_EXPIRED',
  'MANUAL_REVOCATION',
] as const;
export type InvalidationReason = (typeof INVALIDATION_REASONS)[number];

export type TenantScope = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
};

export type PersistedReviewSession = {
  schemaVersion: typeof CROP_REVIEW_PERSISTENCE_VERSION;
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  reviewPacketVersion: string;
  previewId: string | null;
  previewVersion: string;
  status: string;
  backgroundTreatment: string;
  requiredWarningsJson: string[];
  checklistJson: Array<{ id: string; interaction: string; kind: string }>;
  humanDecision: string;
  createdByUserId: string | null;
  reviewedByUserId: string | null;
  expiresAt: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedHumanApproval = {
  schemaVersion: typeof CROP_APPROVAL_PERSISTENCE_VERSION;
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  reviewPacketVersion: string;
  previewId: string;
  previewVersion: string;
  backgroundTreatment: string;
  acceptedWarningsJson: string[];
  confirmedChecklistJson: string[];
  approvalSource: string;
  approvedByUserId: string;
  approvedAt: string;
  clientActionId: string;
  status: 'ACTIVE' | 'REVOKED' | 'INVALIDATED';
  invalidationReason: string | null;
  createdAt: string;
};

export type PersistedAuthorization = {
  schemaVersion: typeof CROP_EXECUTION_AUTHORIZATION_VERSION;
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  approvalId: string;
  reviewSessionId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  previewVersion: string;
  backgroundTreatment: string;
  executionPlanVersion: string;
  clientRequestId: string;
  status: 'ACTIVE' | 'CONSUMED' | 'REVOKED' | 'INVALIDATED';
  createdAt: string;
  consumedAt: string | null;
};

export type PersistedExecutionRun = {
  schemaVersion: typeof CROP_AUTHORIZED_RUNTIME_VERSION;
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  approvalId: string;
  authorizationId: string;
  assetId: string;
  candidateId: string;
  clientRequestId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  inputRef: string;
  tempOutputRef: string | null;
  finalOutputRef: string | null;
  ffmpegExitCode: number | null;
  validationJson: unknown;
  failureCode: string | null;
  failureMessageSanitized: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type PersistResult<T> = { ok: true; value: T } | { ok: false; code: string; errors: string[] };

export type AuthorizationContext = {
  candidateEligible: boolean;
  hardBlocker: boolean;
  assetProductionEligible: boolean;
  truthPrivacyRightsPass: boolean;
  sessionStatus: string;
  sessionCandidateVersion: string;
  sessionPreviewVersion: string;
  sessionBackground: string;
  sessionExpired: boolean;
};

export type AuthorizedCropExecutionRequestV1 = {
  schemaVersion: typeof CROP_EXECUTION_AUTHORIZATION_VERSION;
  approvalId: string;
  reviewSessionId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  previewVersion: string;
  backgroundTreatment: string;
  executionPlanVersion: string;
  clientRequestId: string;
};

import type { CropHumanReviewPacketV1, ReviewItemId } from '../crop-execution/review.types.js';
import type { BackgroundTreatment } from '../crop-execution/execution-plan.types.js';

export const CROP_REVIEW_SESSION_VERSION = 'crop.review-session:v1' as const;
export const CROP_REVIEW_UI_VERSION = 'crop.review-ui:v1' as const;
export const CROP_PREVIEW_RENDER_PLAN_VERSION = 'crop.preview-render-plan:v1' as const;
export const CROP_HUMAN_APPROVAL_COMMAND_VERSION = 'crop.human-approval-command:v1' as const;

export const SESSION_STATUSES = [
  'CREATED',
  'PREVIEW_PENDING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'EXPIRED',
  'INVALIDATED',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PREVIEW_STATUSES = ['NOT_RENDERED', 'PLACEHOLDER_ONLY', 'RENDERING', 'READY', 'FAILED', 'STALE'] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];

export const CHECKLIST_INTERACTION = [
  'PASS_SYSTEM',
  'WARNING_SYSTEM',
  'PENDING_HUMAN',
  'CONFIRMED_HUMAN',
  'FAILED',
  'NOT_APPLICABLE',
] as const;
export type ChecklistInteraction = (typeof CHECKLIST_INTERACTION)[number];

export const HUMAN_REQUIRED_ITEMS: ReviewItemId[] = [
  'MOBILE_READABILITY_ACCEPTABLE',
  'BACKGROUND_TREATMENT_ACCEPTABLE',
  'TEMPORAL_VARIANCE_ACCEPTABLE',
  'PRODUCT_UI_READABLE',
];

export const SELECTABLE_BACKGROUNDS = ['SOLID', 'BLUR_SOURCE', 'DUPLICATE_BLUR', 'STATIC_IMAGE'] as const;
export type SelectableBackground = (typeof SELECTABLE_BACKGROUNDS)[number];

export const REJECT_REASONS = [
  'READABILITY_BAD',
  'WRONG_CROP',
  'BACKGROUND_BAD',
  'TEXT_CUT',
  'CHROME_UNACCEPTABLE',
  'EVIDENCE_MISSING',
  'OTHER',
] as const;

export const CHANGE_REQUESTS = ['TRY_ANOTHER_CANDIDATE', 'CHANGE_BACKGROUND', 'REQUEST_DYNAMIC_REFRAME', 'OTHER'] as const;

export const VISIBLE_WARNINGS = [
  'MOBILE_READABILITY_LOW',
  'SAMPLED_SEMANTIC_PRECISION',
  'HIGH_TEMPORAL_VARIANCE',
  'BACKGROUND_TREATMENT_REQUIRED',
  'STATIC_CROP_WARNINGS',
] as const;

export type TenantScope = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
};

export type CropReviewSessionV1 = {
  schemaVersion: typeof CROP_REVIEW_SESSION_VERSION;
  sessionId: string;
  assetId: string;
  dryRunDecisionRef: string;
  candidateId: string;
  candidateVersion: string;
  reviewPacketVersion: string;
  previewId: string | null;
  previewVersion: string;
  status: SessionStatus;
  previewStatus: PreviewStatus;
  backgroundTreatment: BackgroundTreatment;
  requiredChecklist: Array<{ id: ReviewItemId; interaction: ChecklistInteraction; kind: 'SYSTEM_VERIFIED' | 'HUMAN_CONFIRM_REQUIRED' }>;
  warnings: string[];
  humanDecision: 'NOT_REVIEWED' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
  createdAt: string;
  expiresAt: string;
  ttlHours: 72;
  invalidationReason: string | null;
  scope: TenantScope;
  approvedDecision: null | { decisionVersion: string; previewVersion: string; candidateId: string };
  productionExecutionEligibility: 'NOT_READY' | 'READY_FOR_AUTHORIZED_PLAN' | 'BLOCKED';
  productionUsablePreview: false;
};

export type CropPreviewRenderPlanV1 = {
  schemaVersion: typeof CROP_PREVIEW_RENDER_PLAN_VERSION;
  mode: 'PREVIEW_REVIEW_ONLY';
  previewId: string;
  previewVersion: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  geometry: unknown;
  target: { width: 720; height: 1280; aspectRatio: '9:16' };
  backgroundTreatment: BackgroundTreatment;
  audioPolicy: 'MUTE_SOURCE_AUDIO';
  previewQuality: 'REVIEW_720p';
  watermarkOrMarker: 'REVIEW PREVIEW';
  outputRef: string;
  expiresAt: string;
  productionUsable: false;
  previewOnly: true;
  productionExecutionAllowed: false;
  ffmpegPreviewCalls: 0;
};

export type CropReviewUiModelV1 = {
  schemaVersion: typeof CROP_REVIEW_UI_VERSION;
  sessionId: string;
  assetSummary: { assetId: string };
  candidateStrategy: string;
  previewMediaRef: string | null;
  geometrySummary: unknown;
  evidencePreservation: string;
  mobileReadability: string;
  temporalStability: string;
  browserChromeExclusion: string;
  paddingBackgroundRequirement: boolean;
  warnings: string[];
  reviewChecklist: CropReviewSessionV1['requiredChecklist'];
  backgroundSelector: { value: BackgroundTreatment; suggested: typeof SELECTABLE_BACKGROUNDS; defaultSelected: false };
  approveButton: { enabled: boolean; reason: string };
  rejectEnabled: boolean;
  requestChangesEnabled: boolean;
  eligibleAlternatives: Array<{ candidateId: string; strategy: string; variant?: string }>;
  ineligibleAlternatives: Array<{ candidateId: string; strategy: string; variant?: string; reason: string }>;
  autoApproveOnLoad: false;
  warningsDefaultAccepted: false;
};

export type HumanCropRejectCommandV1 = {
  sessionId: string;
  assetId: string;
  reason: (typeof REJECT_REASONS)[number];
  clientActionId: string;
};

export type HumanCropRequestChangesCommandV1 = {
  sessionId: string;
  assetId: string;
  request: (typeof CHANGE_REQUESTS)[number];
  clientActionId: string;
};

export type HumanCropApprovalCommandV1 = {
  schemaVersion: typeof CROP_HUMAN_APPROVAL_COMMAND_VERSION;
  sessionId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  reviewPacketVersion: string;
  previewRef: string;
  previewVersion: string;
  backgroundTreatmentSelection: BackgroundTreatment;
  acceptedWarnings: string[];
  explicitAction: 'APPROVE';
  clientActionId: string;
  approvalSource: 'USER_UI_ACTION';
};

export type FlowResult = {
  ok: boolean;
  code?: string;
  errors: string[];
  session: CropReviewSessionV1;
  ui: CropReviewUiModelV1;
  approval?: import('../crop-execution/human-approval.types.js').HumanApprovedCropDecisionV1;
  previewPlan?: CropPreviewRenderPlanV1;
};

export type ReviewFlowContext = {
  packet: CropHumanReviewPacketV1;
  eligible: Array<{ candidateId: string; strategy: string; variant?: string; eligibility: string; safetyStatus: string }>;
  ineligible: Array<{ candidateId: string; strategy: string; variant?: string; reason: string }>;
};

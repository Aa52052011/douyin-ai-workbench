import type { HumanReviewTrigger } from '../visual-crop-comparison/comparison.types.js';
import type { CropSelectionDryRunResultV1 } from '../director-visual-policy/policy.types.js';

export const CROP_DECISION_REVIEW_VERSION = 'crop.decision-review:v1' as const;
export const CROP_HUMAN_REVIEW_PACKET_VERSION = 'crop.human-review-packet:v1' as const;

export const REVIEW_ITEM_IDS = [
  'EVIDENCE_PRESERVED',
  'PRODUCT_UI_READABLE',
  'NAVIGATION_READABLE',
  'TEXT_NOT_CUT',
  'BROWSER_CHROME_ACCEPTABLE',
  'BACKGROUND_TREATMENT_ACCEPTABLE',
  'TEMPORAL_VARIANCE_ACCEPTABLE',
  'NO_TRUTH_MISREPRESENTATION',
  'NO_PRIVACY_RIGHTS_BLOCKER',
  'MOBILE_READABILITY_ACCEPTABLE',
] as const;
export type ReviewItemId = (typeof REVIEW_ITEM_IDS)[number];

export const REVIEW_ITEM_STATUSES = ['PASS', 'FAIL', 'WARNING', 'PENDING_HUMAN_REVIEW', 'NOT_APPLICABLE'] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export const HUMAN_REVIEW_DECISIONS = ['NOT_REVIEWED', 'APPROVED', 'REJECTED', 'REQUEST_CHANGES'] as const;
export type HumanReviewDecision = (typeof HUMAN_REVIEW_DECISIONS)[number];

export type ReviewChecklistItem = {
  id: ReviewItemId;
  status: ReviewItemStatus;
  summary: string;
  ruleIds: string[];
};

export type CropDecisionReviewContractV1 = {
  schemaVersion: typeof CROP_DECISION_REVIEW_VERSION;
  assetId: string;
  dryRunCandidateId: string | null;
  dryRunStrategy: string | null;
  reviewRequired: true;
  reviewReasons: HumanReviewTrigger[];
  reviewChecklist: ReviewChecklistItem[];
  warnings: string[];
  evidenceSummary: {
    evidence: string;
    readability: string;
    temporal: string;
    chromeExclusion: string;
  };
  executionPreview: 'PREVIEW_ONLY_AVAILABLE' | 'NOT_AVAILABLE';
  humanDecision: HumanReviewDecision;
  humanDecisionSource: null;
  reviewedAt: null;
  productionExecutionAllowed: false;
  selectionType: CropSelectionDryRunResultV1['selectionType'];
};

export type CropHumanReviewPacketV1 = CropDecisionReviewContractV1 & {
  packetVersion: typeof CROP_HUMAN_REVIEW_PACKET_VERSION;
  geometry: { sourceRect: unknown; fitMode: string | null; padRequired: boolean | null };
  backgroundRequirement: boolean | null;
  dynamicReframeSignal: CropSelectionDryRunResultV1['dynamicReframeSignal'] | null;
  note: 'PACKET_IS_NOT_APPROVAL';
};

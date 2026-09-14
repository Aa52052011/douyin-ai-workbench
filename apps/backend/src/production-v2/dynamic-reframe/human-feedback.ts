import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import {
  HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION,
  type HumanFindingCode,
  type HumanVisualReviewFeedbackV1,
} from './types.js';

export const CONTENT_01_REVIEW_SESSION_ID = '10db0e91-98bc-44b5-ab49-68b5d743f8a1';

export const CONTENT_01_HUMAN_FINDINGS: HumanFindingCode[] = [
  'PRODUCT_UI_TOO_SMALL',
  'TEXT_UNREADABLE_ON_DOUYIN_DEFAULT_MOBILE_VIEW',
  'BACKGROUND_VISUAL_SEPARATION_WEAK',
  'NO_DYNAMIC_LOCAL_FOCUS',
  'STATIC_CROP_INSUFFICIENT',
  'DYNAMIC_REFRAME_REQUIRED',
];

export function buildContent01HumanFeedback(): HumanVisualReviewFeedbackV1 {
  return {
    schemaVersion: HUMAN_VISUAL_REVIEW_FEEDBACK_VERSION,
    source: 'EXPLICIT_USER_MESSAGE',
    reviewTarget: {
      assetId: CONTENT_01_NEW_ASSET_ID,
      sessionId: CONTENT_01_REVIEW_SESSION_ID,
      candidateId: 'crop:top-trim',
      strategy: 'TOP_TRIM',
      background: 'BLUR_SOURCE',
      previewStatus: 'READY',
    },
    decision: 'REQUEST_CHANGES',
    mobileReadabilityStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
    findings: [...CONTENT_01_HUMAN_FINDINGS],
    requestedRepairDirection: 'DYNAMIC_REFRAME',
    approved: false,
    persistence: {
      humanDecisionIntegrated: false,
      reason: 'EXPLICIT_USER_MESSAGE_NOT_USER_UI_ACTION',
      humanCropApprovalCreated: false,
    },
  };
}

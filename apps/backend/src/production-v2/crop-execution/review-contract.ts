import type { CropCandidateComparativeEvaluationV1 } from '../visual-crop-comparison/comparison.types.js';
import type { CropSelectionDryRunResultV1 } from '../director-visual-policy/policy.types.js';
import {
  CROP_DECISION_REVIEW_VERSION,
  CROP_HUMAN_REVIEW_PACKET_VERSION,
  type CropDecisionReviewContractV1,
  type CropHumanReviewPacketV1,
  type ReviewChecklistItem,
} from './review.types.js';

export function buildReviewChecklist(dryRun: CropSelectionDryRunResultV1): ReviewChecklistItem[] {
  const option = dryRun.selectedOption;
  const evidence = option?.metrics.keyEvidencePreservation.label ?? 'LOW';
  const readability = option?.metrics.mobileReadability.label ?? 'LOW';
  const temporal = option?.metrics.temporalStability.label ?? 'LOW';
  const chrome = option?.metrics.browserChromeExclusion.label ?? 'LOW';
  const nav = option?.metrics.navigationPreservation.label ?? 'LOW';
  const textCutoff = option?.risks.includes('TEXT_CUTOFF_RISK') ?? false;
  return [
    {
      id: 'EVIDENCE_PRESERVED',
      status: evidence === 'HIGH' ? 'PASS' : evidence === 'MEDIUM' ? 'WARNING' : 'FAIL',
      summary: `key evidence ${evidence}`,
      ruleIds: ['REVIEW_EVIDENCE'],
    },
    {
      id: 'PRODUCT_UI_READABLE',
      status: readability === 'HIGH' ? 'PASS' : 'PENDING_HUMAN_REVIEW',
      summary: `product UI readability proxy ${readability}`,
      ruleIds: ['REVIEW_PRODUCT_UI_READABILITY'],
    },
    {
      id: 'NAVIGATION_READABLE',
      status: nav === 'HIGH' ? 'PASS' : 'PENDING_HUMAN_REVIEW',
      summary: `navigation preservation ${nav}`,
      ruleIds: ['REVIEW_NAVIGATION'],
    },
    {
      id: 'TEXT_NOT_CUT',
      status: textCutoff ? 'WARNING' : 'PASS',
      summary: textCutoff ? 'text cutoff risk present' : 'no TEXT_CUTOFF_RISK on selected option',
      ruleIds: ['REVIEW_TEXT'],
    },
    {
      id: 'BROWSER_CHROME_ACCEPTABLE',
      status: chrome === 'HIGH' ? 'PASS' : 'PENDING_HUMAN_REVIEW',
      summary: `chrome exclusion ${chrome}`,
      ruleIds: ['REVIEW_CHROME'],
    },
    {
      id: 'BACKGROUND_TREATMENT_ACCEPTABLE',
      status: dryRun.requiresBackgroundTreatment ? 'PENDING_HUMAN_REVIEW' : 'NOT_APPLICABLE',
      summary: dryRun.requiresBackgroundTreatment ? 'PAD/background required and unresolved' : 'no pad',
      ruleIds: ['REVIEW_BACKGROUND'],
    },
    {
      id: 'TEMPORAL_VARIANCE_ACCEPTABLE',
      status: temporal === 'HIGH' ? 'PASS' : 'PENDING_HUMAN_REVIEW',
      summary: `temporal ${temporal}; sampled precision`,
      ruleIds: ['REVIEW_TEMPORAL'],
    },
    {
      id: 'NO_TRUTH_MISREPRESENTATION',
      status: option?.hardViolations.some((item) => item.includes('TRUTH')) ? 'FAIL' : 'PASS',
      summary: 'no truth hard violation on selected option',
      ruleIds: ['REVIEW_TRUTH'],
    },
    {
      id: 'NO_PRIVACY_RIGHTS_BLOCKER',
      status: option?.hardViolations.some((item) => item.includes('PRIVACY') || item.includes('RIGHTS')) ? 'FAIL' : 'PASS',
      summary: 'no privacy/rights hard blocker on selected option',
      ruleIds: ['REVIEW_PRIVACY_RIGHTS'],
    },
    {
      id: 'MOBILE_READABILITY_ACCEPTABLE',
      status: readability === 'HIGH' ? 'PASS' : 'PENDING_HUMAN_REVIEW',
      summary: `mobile readability ${readability} cannot be auto-accepted`,
      ruleIds: ['REVIEW_MOBILE_READABILITY'],
    },
  ];
}

export function buildCropDecisionReview(
  dryRun: CropSelectionDryRunResultV1,
  evaluation: CropCandidateComparativeEvaluationV1,
): CropDecisionReviewContractV1 {
  const option = dryRun.selectedOption;
  return {
    schemaVersion: CROP_DECISION_REVIEW_VERSION,
    assetId: dryRun.assetId,
    dryRunCandidateId: dryRun.selectedCandidateId,
    dryRunStrategy: dryRun.selectedStrategy,
    reviewRequired: true,
    reviewReasons: dryRun.humanReview.reasons.length ? dryRun.humanReview.reasons : evaluation.humanReviewTriggers,
    reviewChecklist: buildReviewChecklist(dryRun),
    warnings: option?.risks ?? dryRun.rationale.primaryReasons,
    evidenceSummary: {
      evidence: option?.metrics.keyEvidencePreservation.label ?? 'NOT_APPLICABLE',
      readability: option?.metrics.mobileReadability.label ?? 'NOT_APPLICABLE',
      temporal: option?.metrics.temporalStability.label ?? 'NOT_APPLICABLE',
      chromeExclusion: option?.metrics.browserChromeExclusion.label ?? 'NOT_APPLICABLE',
    },
    executionPreview: option ? 'PREVIEW_ONLY_AVAILABLE' : 'NOT_AVAILABLE',
    humanDecision: 'NOT_REVIEWED',
    humanDecisionSource: null,
    reviewedAt: null,
    productionExecutionAllowed: false,
    selectionType: dryRun.selectionType,
  };
}

export function buildHumanReviewPacket(
  dryRun: CropSelectionDryRunResultV1,
  evaluation: CropCandidateComparativeEvaluationV1,
): CropHumanReviewPacketV1 {
  const review = buildCropDecisionReview(dryRun, evaluation);
  return {
    ...review,
    packetVersion: CROP_HUMAN_REVIEW_PACKET_VERSION,
    geometry: {
      sourceRect: dryRun.selectedOption?.sourceRect ?? null,
      fitMode: dryRun.selectedOption?.fitMode ?? null,
      padRequired: dryRun.selectedOption?.padRequired ?? null,
    },
    backgroundRequirement: dryRun.requiresBackgroundTreatment,
    dynamicReframeSignal: dryRun.dynamicReframeSignal,
    note: 'PACKET_IS_NOT_APPROVAL',
  };
}

import type { CropCandidateComparativeEvaluationV1, DirectorCropDecisionV1, DirectorCropOptionV1 } from '../visual-crop-comparison/comparison.types.js';
import { DIRECTOR_CROP_CONTRACT_VERSION } from '../visual-crop-comparison/comparison.types.js';
import { validateDirectorCropDecision } from '../visual-crop-comparison/director-crop-validator.js';
import { runDirectorVisualPolicy } from './policy-engine.js';
import { snapshots } from './policy-metrics.js';
import {
  CROP_SELECTION_DRYRUN_VERSION,
  DIRECTOR_VISUAL_POLICY_VERSION,
  POLICY_RULE_IDS,
  type CropSelectionDryRunResultV1,
  type RejectedEligibleAlternative,
} from './policy.types.js';

function rejectionReasons(selected: DirectorCropOptionV1 | null, option: DirectorCropOptionV1): string[] {
  const reasons: string[] = [];
  const s = snapshots(option);
  const sel = selected ? snapshots(selected) : null;
  if (s.readabilityLabel === 'LOW') reasons.push('LOW_MOBILE_READABILITY');
  if (option.softTradeoffs.includes('LOW_OCCUPANCY')) reasons.push('LOW_OCCUPANCY');
  if (option.padRequired || option.softTradeoffs.includes('PAD_REQUIRED')) reasons.push('BACKGROUND_OR_PADDING_BURDEN');
  if (option.softTradeoffs.includes('SAMPLED_TEMPORAL_VARIANCE')) reasons.push('SAMPLED_TEMPORAL_VARIANCE');
  if (sel && s.sourceRetention < sel.sourceRetention) reasons.push('LOWER_SOURCE_RETENTION');
  if (sel && s.chromeExclusion < sel.chromeExclusion) reasons.push('LOWER_BROWSER_CHROME_EXCLUSION');
  if (sel && s.evidence < sel.evidence) reasons.push('LOWER_KEY_EVIDENCE_PRESERVATION');
  if (sel && s.worstFrameEvidence < sel.worstFrameEvidence) reasons.push('LOWER_WORST_FRAME_EVIDENCE');
  if (sel && s.temporal < sel.temporal) reasons.push('LOWER_TEMPORAL_STABILITY');
  if (reasons.length === 0) reasons.push('LEXICOGRAPHIC_POLICY_ORDER');
  return [...new Set(reasons)];
}

function toDirectorDecision(evaluation: CropCandidateComparativeEvaluationV1, dryRun: CropSelectionDryRunResultV1): DirectorCropDecisionV1 {
  const tradeoffIds = evaluation.tradeoffs
    .filter((item) => dryRun.selectedCandidateId && (item.optionA === dryRun.selectedCandidateId || item.optionB === dryRun.selectedCandidateId))
    .map((item) => `${item.optionA}:${item.optionB}:${item.axis}`);
  const accepted = tradeoffIds.length ? tradeoffIds.slice(0, 4) : evaluation.tradeoffs.slice(0, 1).map((item) => `${item.optionA}:${item.optionB}:${item.axis}`);
  return {
    schemaVersion: DIRECTOR_CROP_CONTRACT_VERSION,
    selectedCandidateId: dryRun.selectedCandidateId ?? 'REQUEST_NEW_CANDIDATE',
    rationale: {
      text: dryRun.rationale.text,
      tradeoffIds: accepted,
      metricAxes: ['KEY_EVIDENCE_PRESERVATION', 'MOBILE_READABILITY', 'BROWSER_CHROME_EXCLUSION'],
      claimImpactRefs: dryRun.selectedOption?.claimSupportImpact.map((item) => item.claimId) ?? [],
      safetyRefs: dryRun.selectedOption?.hardViolations ?? [],
      sourceRefs: dryRun.selectedOption?.provenance.sourceRefs ?? evaluation.candidates[0]?.provenance.sourceRefs ?? [{ kind: 'CONTEXT_EVALUATION', sourceType: 'SYSTEM_FACT', sourceId: 'policy', field: 'dry-run', valueSummary: 'request-new' }],
    },
    objective: 'BALANCED',
    acceptedTradeoffs: accepted.length ? accepted : ['KEY_EVIDENCE_PRESERVATION'],
    rejectedAlternatives: dryRun.rationale.rejectedAlternatives.map((item) => item.candidateId),
    evidenceRefs: dryRun.selectedOption?.provenance.sourceRefs ?? [],
    ruleRefs: dryRun.policyTrace.map((item) => item.ruleId),
    confidence: dryRun.confidence,
    requiresDynamicReframe: dryRun.dynamicReframeSignal === 'REQUEST_DYNAMIC_REFRAME',
    requiresHumanReview: dryRun.humanReview.requiredBeforeProduction,
    decisionBoundary: 'SYSTEM_DRY_RUN_NOT_HUMAN_APPROVED_NOT_PRODUCTION_EXECUTION',
  };
}

export function runCropSelectionDryRun(evaluation: CropCandidateComparativeEvaluationV1): CropSelectionDryRunResultV1 {
  const engine = runDirectorVisualPolicy(evaluation);
  const ineligibleBaselines = evaluation.candidates
    .filter((item) => item.eligibility === 'INELIGIBLE' || item.safetyStatus === 'UNSAFE')
    .map((item) => ({ candidateId: item.candidateId, reason: 'INELIGIBLE_BY_B2_9_SAFETY' as const }));

  if (engine.decision === 'BLOCKED_BY_ASSET_USAGE') {
    return {
      schemaVersion: CROP_SELECTION_DRYRUN_VERSION,
      policyVersion: DIRECTOR_VISUAL_POLICY_VERSION,
      assetId: evaluation.assetId,
      objective: 'BALANCED',
      objectiveBias: 'EVIDENCE_FIRST',
      selectionType: 'SYSTEM_DRY_RUN_SELECTION',
      decisionAllowed: false,
      selectedCandidateId: null,
      selectedStrategy: 'BLOCKED_BY_ASSET_USAGE',
      decision: 'BLOCKED_BY_ASSET_USAGE',
      selectedOption: null,
      rationale: {
        primaryReasons: ['ASSET_PRODUCTION_BLOCKED'],
        acceptedTradeoffs: [],
        rejectedAlternatives: [],
        ineligibleBaselines,
        comparisonRefs: [],
        text: 'Normal crop selection is not allowed for a production-blocked asset.',
      },
      humanReview: { recommended: false, requiredBeforeProduction: true, reasons: evaluation.humanReviewTriggers },
      humanApproved: false,
      productionExecutionAllowed: false,
      confidence: 'LOW',
      temporalCaution: true,
      requiresBackgroundTreatment: null,
      dynamicReframeSignal: 'NONE',
      policyTrace: engine.trace,
      contractValidation: { ok: false, errors: ['DECISION_NOT_ALLOWED_FOR_BLOCKED_ASSET'] },
      provenance: { ruleIds: [POLICY_RULE_IDS.BLOCKED_ASSET, POLICY_RULE_IDS.NO_EXECUTION, POLICY_RULE_IDS.NO_HUMAN_APPROVAL] },
    };
  }

  const selected = engine.selected;
  const rejected: RejectedEligibleAlternative[] = evaluation.directorEligibleOptions
    .filter((item) => item.candidateId !== selected?.candidateId)
    .map((item) => ({
      candidateId: item.candidateId,
      strategy: item.strategy,
      variant: item.variant,
      reasons: rejectionReasons(selected, item),
    }));

  const primaryReasons: string[] = [];
  if (engine.decision === 'REQUEST_NEW_CANDIDATE') {
    primaryReasons.push('NO_ELIGIBLE_CANDIDATE_ABOVE_POLICY_FLOORS');
  } else if (selected) {
    const s = snapshots(selected);
    primaryReasons.push(`SELECTED:${selected.candidateId}`);
    primaryReasons.push(`WORST_FRAME_EVIDENCE:${s.worstFrameEvidence.toFixed(3)}`);
    primaryReasons.push(`READABILITY:${s.readabilityLabel}`);
    primaryReasons.push(`CHROME_EXCLUSION:${s.chromeExclusion.toFixed(3)}`);
    primaryReasons.push('TEMPORAL_CAUTION_SAMPLED');
  }

  const acceptedTradeoffs: string[] = [];
  if (selected?.padRequired) acceptedTradeoffs.push('LETTERBOX_OR_BACKGROUND_REQUIRED');
  if (selected?.softTradeoffs.includes('SAMPLED_TEMPORAL_VARIANCE')) acceptedTradeoffs.push('SAMPLED_TEMPORAL_VARIANCE');
  if (selected?.metrics.mobileReadability.label === 'LOW') acceptedTradeoffs.push('MOBILE_READABILITY_WARNING');
  if (selected && selected.metrics.browserChromeExclusion.value < 0.95) acceptedTradeoffs.push('BROWSER_CHROME_REMAINS');

  const text =
    engine.decision === 'REQUEST_NEW_CANDIDATE'
      ? 'System dry-run requests a new candidate; no eligible option met evidence/readability floors. Not a human approval or production execution.'
      : `System dry-run recommendation is ${selected?.candidateId} under BALANCED+EVIDENCE_FIRST. Rejected eligible alternatives: ${rejected
          .map((item) => `${item.candidateId}(${item.reasons.join(',')})`)
          .join('; ')}. Temporal caution: sampled precision only. Not human-approved. Not production-executable.`;

  const dryRun: CropSelectionDryRunResultV1 = {
    schemaVersion: CROP_SELECTION_DRYRUN_VERSION,
    policyVersion: DIRECTOR_VISUAL_POLICY_VERSION,
    assetId: evaluation.assetId,
    objective: 'BALANCED',
    objectiveBias: 'EVIDENCE_FIRST',
    selectionType: 'SYSTEM_DRY_RUN_SELECTION',
    decisionAllowed: true,
    selectedCandidateId: selected?.candidateId ?? null,
    selectedStrategy:
      engine.decision === 'REQUEST_NEW_CANDIDATE'
        ? 'REQUEST_NEW_CANDIDATE'
        : selected?.variant === 'BALANCED' && selected.strategy === 'UI_FOCUS'
          ? 'UI_FOCUS_BALANCED'
          : selected?.strategy ?? 'REQUEST_NEW_CANDIDATE',
    decision: engine.decision,
    selectedOption: selected,
    rationale: {
      primaryReasons,
      acceptedTradeoffs,
      rejectedAlternatives: rejected,
      ineligibleBaselines,
      comparisonRefs: evaluation.tradeoffs.map((item) => `${item.optionA}:${item.optionB}:${item.axis}`),
      text,
    },
    humanReview: {
      recommended: evaluation.humanReviewRecommended,
      requiredBeforeProduction: true,
      reasons: evaluation.humanReviewTriggers,
    },
    humanApproved: false,
    productionExecutionAllowed: false,
    confidence: evaluation.humanReviewTriggers.includes('HIGH_TEMPORAL_VARIANCE') || evaluation.humanReviewTriggers.includes('SAMPLED_SEMANTIC_PRECISION') ? 'LOW' : 'MEDIUM',
    temporalCaution: true,
    requiresBackgroundTreatment: selected ? selected.padRequired : null,
    dynamicReframeSignal:
      evaluation.dynamicReframeSignal === 'DYNAMIC_LIKELY_REQUIRED'
        ? 'REQUEST_DYNAMIC_REFRAME'
        : evaluation.dynamicReframeSignal === 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME'
          ? 'MAY_BENEFIT_FROM_DYNAMIC_REFRAME'
          : 'NONE',
    policyTrace: engine.trace,
    contractValidation: { ok: false, errors: [] },
    provenance: { ruleIds: engine.trace.map((item) => item.ruleId) },
  };

  if (engine.decision === 'REQUEST_NEW_CANDIDATE') {
    dryRun.contractValidation = validateDirectorCropDecision(evaluation, toDirectorDecision(evaluation, dryRun));
    return dryRun;
  }

  dryRun.contractValidation = validateDirectorCropDecision(evaluation, toDirectorDecision(evaluation, dryRun));
  return dryRun;
}

export { toDirectorDecision };

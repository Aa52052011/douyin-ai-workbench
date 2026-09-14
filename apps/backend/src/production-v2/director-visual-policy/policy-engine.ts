import { geometryRef } from '../visual-hybrid/hybrid-provenance.js';
import type { CropCandidateComparativeEvaluationV1, DirectorCropOptionV1 } from '../visual-crop-comparison/comparison.types.js';
import { isDirectorEligible } from '../visual-crop-comparison/eligibility.js';
import { LABEL_RANK, passesEvidenceFloor, passesReadabilityHardFloor, snapshots } from './policy-metrics.js';
import { POLICY_FLOORS, POLICY_RULE_IDS, type DirectorPolicyTraceEntry } from './policy.types.js';

function trace(ruleId: string, affected: readonly DirectorCropOptionV1[], outcome: string): DirectorPolicyTraceEntry {
  return {
    ruleId,
    affectedCandidates: affected.map((item) => item.candidateId),
    outcome,
    evidenceRefs: [geometryRef('policy', ruleId)],
  };
}

function compareLexicographic(a: DirectorCropOptionV1, b: DirectorCropOptionV1): number {
  const as = snapshots(a);
  const bs = snapshots(b);
  const worstA = as.worstFrameEvidence;
  const worstB = bs.worstFrameEvidence;
  if (worstA !== worstB) return worstB - worstA;
  const labelDiff = LABEL_RANK[bs.readabilityLabel] - LABEL_RANK[as.readabilityLabel];
  if (labelDiff !== 0) return labelDiff;
  if (as.readabilityLabel !== 'LOW' && bs.readability !== as.readability) return bs.readability - as.readability;
  if (as.temporal !== bs.temporal) return bs.temporal - as.temporal;
  if (as.chromeExclusion !== bs.chromeExclusion) return bs.chromeExclusion - as.chromeExclusion;
  if (as.presentation !== bs.presentation) return bs.presentation - as.presentation;
  if (as.sourceRetention !== bs.sourceRetention) return bs.sourceRetention - as.sourceRetention;
  return a.candidateId.localeCompare(b.candidateId);
}

export type PolicyEngineResult = {
  remaining: DirectorCropOptionV1[];
  selected: DirectorCropOptionV1 | null;
  decision: 'SELECTED' | 'REQUEST_NEW_CANDIDATE' | 'BLOCKED_BY_ASSET_USAGE';
  trace: DirectorPolicyTraceEntry[];
};

export function runDirectorVisualPolicy(evaluation: CropCandidateComparativeEvaluationV1): PolicyEngineResult {
  const entries: DirectorPolicyTraceEntry[] = [];
  if (!evaluation.decisionAllowed) {
    entries.push(trace(POLICY_RULE_IDS.BLOCKED_ASSET, evaluation.candidates, 'BLOCKED_BY_ASSET_USAGE'));
    return { remaining: [], selected: null, decision: 'BLOCKED_BY_ASSET_USAGE', trace: entries };
  }

  const eligible = evaluation.directorEligibleOptions.filter((item) => isDirectorEligible(item.eligibility) && item.safetyStatus !== 'UNSAFE');
  entries.push(trace(POLICY_RULE_IDS.FILTER_INELIGIBLE, eligible, `eligible=${eligible.length}`));

  const afterEvidence = eligible.filter(passesEvidenceFloor);
  entries.push(trace(POLICY_RULE_IDS.EVIDENCE_FLOOR, afterEvidence, `passEvidenceFloor=${afterEvidence.length}`));
  entries.push(trace(POLICY_RULE_IDS.PROTECT_CLAIM, afterEvidence, 'C5 ignored; claim floor uses C1-C4/child evidence'));
  entries.push(trace(POLICY_RULE_IDS.C5_IGNORED, afterEvidence, 'C5 auto-publish does not influence ranking'));

  if (afterEvidence.length === 0) {
    entries.push(trace(POLICY_RULE_IDS.REQUEST_NEW, [], 'NO_CANDIDATE_ABOVE_EVIDENCE_FLOOR'));
    return { remaining: [], selected: null, decision: 'REQUEST_NEW_CANDIDATE', trace: entries };
  }

  const afterReadability = afterEvidence.filter(passesReadabilityHardFloor);
  entries.push(trace(POLICY_RULE_IDS.READABILITY_FLOOR, afterReadability, `passReadabilityHardFloor=${afterReadability.length}`));
  if (afterReadability.length === 0) {
    entries.push(trace(POLICY_RULE_IDS.REQUEST_NEW, [], 'NO_CANDIDATE_ABOVE_READABILITY_HARD_FLOOR'));
    return { remaining: [], selected: null, decision: 'REQUEST_NEW_CANDIDATE', trace: entries };
  }

  const hasNonLow = afterReadability.some((item) => item.metrics.mobileReadability.label !== 'LOW');
  let pool = afterReadability;
  if (hasNonLow) {
    const nonLow = afterReadability.filter((item) => item.metrics.mobileReadability.label !== 'LOW');
    const bestNonLowEvidence = Math.max(...nonLow.map((item) => snapshots(item).worstFrameEvidence));
    pool = afterReadability.filter((item) => {
      if (item.metrics.mobileReadability.label !== 'LOW') return true;
      return snapshots(item).worstFrameEvidence - bestNonLowEvidence >= POLICY_FLOORS.metricDelta;
    });
    entries.push(trace(POLICY_RULE_IDS.READABILITY_PREFERENCE, pool, 'deprioritized LOW readability unless evidence advantage'));
  } else {
    entries.push(trace(POLICY_RULE_IDS.READABILITY_PREFERENCE, pool, 'all remaining LOW readability; skip numeric occupancy preference'));
  }

  entries.push(trace(POLICY_RULE_IDS.TEMPORAL_CAUTION, pool, 'sampled temporal caution attached to any selection'));
  entries.push(trace(POLICY_RULE_IDS.PRESENTATION_PREFERENCE, pool, 'chrome exclusion is soft after evidence/readability'));
  const ordered = [...pool].sort(compareLexicographic);
  const selected = ordered[0] ?? null;
  if (!selected) {
    entries.push(trace(POLICY_RULE_IDS.REQUEST_NEW, [], 'EMPTY_AFTER_RANKING'));
    return { remaining: [], selected: null, decision: 'REQUEST_NEW_CANDIDATE', trace: entries };
  }
  entries.push(trace(POLICY_RULE_IDS.SOURCE_RETENTION_TIEBREAK, ordered, `ordered=${ordered.map((item) => item.candidateId).join(',')}`));
  entries.push(trace(POLICY_RULE_IDS.LEXICAL_TIEBREAK, [selected], `selected=${selected.candidateId}`));
  return { remaining: ordered, selected, decision: 'SELECTED', trace: entries };
}

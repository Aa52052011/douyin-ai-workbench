import type { DirectorCropOptionV1 } from '../visual-crop-comparison/comparison.types.js';
import { POLICY_FLOORS } from './policy.types.js';

export function snapshots(option: DirectorCropOptionV1) {
  return {
    evidence: option.metrics.keyEvidencePreservation.value,
    claim: option.metrics.claimSupport.value,
    readability: option.metrics.mobileReadability.value,
    readabilityLabel: option.metrics.mobileReadability.label,
    temporal: option.metrics.temporalStability.value,
    presentation: option.metrics.presentationCleanliness.value,
    sourceRetention: option.metrics.sourceRetention.value,
    chromeExclusion: option.metrics.browserChromeExclusion.value,
    worstFrameEvidence: option.perFrameSummary.evidenceMin ?? option.metrics.keyEvidencePreservation.value,
  };
}

export function passesEvidenceFloor(option: DirectorCropOptionV1): boolean {
  const s = snapshots(option);
  return s.evidence >= POLICY_FLOORS.evidenceMin && s.claim >= POLICY_FLOORS.claimMin && s.worstFrameEvidence >= POLICY_FLOORS.evidenceMin;
}

export function passesReadabilityHardFloor(option: DirectorCropOptionV1): boolean {
  return snapshots(option).readability >= POLICY_FLOORS.readabilityHardMin;
}

export const LABEL_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;

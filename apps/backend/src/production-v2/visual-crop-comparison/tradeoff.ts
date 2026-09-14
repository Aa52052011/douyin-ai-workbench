import type { ComparisonAxis, CropTradeoffV1, DirectorCropOptionV1 } from './comparison.types.js';
import { COMPARISON_RULE_IDS, COMPARISON_THRESHOLDS } from './thresholds.js';

function axisValue(option: DirectorCropOptionV1, axis: ComparisonAxis): number {
  const map: Record<ComparisonAxis, number> = {
    SAFETY: option.metrics.safety.value,
    KEY_EVIDENCE_PRESERVATION: option.metrics.keyEvidencePreservation.value,
    PRODUCT_UI_PRESERVATION: option.metrics.productUiPreservation.value,
    NAVIGATION_PRESERVATION: option.metrics.navigationPreservation.value,
    TEXT_PRESERVATION: option.metrics.textPreservation.value,
    BROWSER_CHROME_EXCLUSION: option.metrics.browserChromeExclusion.value,
    SOURCE_RETENTION: option.metrics.sourceRetention.value,
    OUTPUT_OCCUPANCY: option.metrics.outputOccupancy.value,
    MOBILE_READABILITY: option.metrics.mobileReadability.value,
    TEMPORAL_STABILITY: option.metrics.temporalStability.value,
    CLAIM_SUPPORT: option.metrics.claimSupport.value,
    PRESENTATION_CLEANLINESS: option.metrics.presentationCleanliness.value,
  };
  return map[axis];
}

export function pairwiseTradeoff(a: DirectorCropOptionV1, b: DirectorCropOptionV1, axis: ComparisonAxis): CropTradeoffV1 {
  const av = axisValue(a, axis);
  const bv = axisValue(b, axis);
  const delta = av - bv;
  const winnerOnAxis =
    Math.abs(delta) < COMPARISON_THRESHOLDS.dominanceDelta ? 'TIE' : delta > 0 ? a.candidateId : b.candidateId;
  return {
    optionA: a.candidateId,
    optionB: b.candidateId,
    axis,
    winnerOnAxis,
    magnitude: Math.abs(delta),
    explanation: `${a.candidateId} ${axis}=${av.toFixed(3)}; ${b.candidateId} ${axis}=${bv.toFixed(3)}; not an overall winner`,
    sourceRefs: a.provenance.sourceRefs,
    ruleIds: [COMPARISON_RULE_IDS.NO_OVERALL_SCORE, COMPARISON_RULE_IDS.HARD_OVER_PRESENTATION],
  };
}

export function buildTradeoffs(options: readonly DirectorCropOptionV1[]): CropTradeoffV1[] {
  const contain = options.find((item) => item.strategy === 'CONTAIN');
  const topTrim = options.find((item) => item.strategy === 'TOP_TRIM');
  const out: CropTradeoffV1[] = [];
  if (contain && topTrim) {
    out.push(pairwiseTradeoff(contain, topTrim, 'SOURCE_RETENTION'));
    out.push(pairwiseTradeoff(contain, topTrim, 'BROWSER_CHROME_EXCLUSION'));
    out.push(pairwiseTradeoff(contain, topTrim, 'OUTPUT_OCCUPANCY'));
    out.push(pairwiseTradeoff(contain, topTrim, 'KEY_EVIDENCE_PRESERVATION'));
  }
  const eligible = options.filter((item) => item.eligibility === 'ELIGIBLE' || item.eligibility === 'ELIGIBLE_WITH_WARNINGS');
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (contain && topTrim && ((a === contain && b === topTrim) || (a === topTrim && b === contain))) continue;
      out.push(pairwiseTradeoff(a, b, 'KEY_EVIDENCE_PRESERVATION'));
      out.push(pairwiseTradeoff(a, b, 'MOBILE_READABILITY'));
    }
  }
  return out;
}

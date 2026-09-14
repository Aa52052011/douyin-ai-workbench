import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import type { CropConstraintRegion, HybridVisualRegion } from '../visual-hybrid/hybrid.types.js';
import { geometryRef } from '../visual-hybrid/hybrid-provenance.js';
import { coverageOf, containsRect, median } from './rect-math.js';
import { coverageByType, evidenceRegions, meanCoverage, minCoverage } from './coverage.js';
import { CROP_SAFETY_THRESHOLDS, RULE_IDS } from './threshold-config.js';
import type {
  AggregateSafetyMetrics,
  CandidateRiskSignal,
  ConstraintCoverageResult,
  CropCandidateDraft,
  CropCandidateStatus,
  CropPositiveSignal,
  CropSafetyGroup,
  CropSafetyValidationResultV1,
  PerFrameSafetyMetrics,
  RegionCoverage,
  SemanticCropCandidateV1,
} from './crop-candidate.types.js';
import { CROP_SAFETY_VERSION } from './crop-candidate.types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

const CHILD_KEEP_TYPES = new Set(['NAVIGATION', 'CONTENT_PANEL']);

function isChildShouldKeep(region: HybridVisualRegion, constraint?: CropConstraintRegion): boolean {
  if (constraint?.kind !== 'SHOULD_KEEP' && constraint?.kind !== 'MUST_KEEP') return false;
  if (CHILD_KEEP_TYPES.has(region.semanticType ?? '')) return true;
  return region.semanticType === 'TEXT_REGION' && Boolean(region.flags.evidenceBearing);
}

function occupancyRisk(candidate: Pick<SemanticCropCandidateV1, 'fitMode' | 'sourceOccupancy' | 'retainedAreaRatio'>): CandidateRiskSignal[] {
  const risks: CandidateRiskSignal[] = [];
  if (candidate.fitMode === 'CONTAIN' && candidate.sourceOccupancy < CROP_SAFETY_THRESHOLDS.occupancyReadabilityWarnMax) {
    const severity = candidate.sourceOccupancy < 0.35 ? 'HIGH' : 'MEDIUM';
    risks.push({
      code: 'READABILITY_LOSS',
      severity,
      summary: `CONTAIN occupancy ${candidate.sourceOccupancy.toFixed(4)} below ${CROP_SAFETY_THRESHOLDS.occupancyReadabilityWarnMax}`,
      ruleIds: [RULE_IDS.CONTAIN_OCCUPANCY],
      sourceRefs: [geometryRef('sourceOccupancy', candidate.sourceOccupancy.toFixed(4))],
    });
    risks.push({
      code: 'LOW_OCCUPANCY',
      severity,
      summary: 'LOW_OCCUPANCY / MOBILE_LEGIBILITY_RISK',
      ruleIds: [RULE_IDS.CONTAIN_OCCUPANCY],
      sourceRefs: [geometryRef('sourceOccupancy', candidate.sourceOccupancy.toFixed(4))],
    });
    risks.push({
      code: 'MOBILE_LEGIBILITY_RISK',
      severity,
      summary: 'letterbox/pad occupy majority of 9:16 canvas',
      ruleIds: [RULE_IDS.CONTAIN_OCCUPANCY],
      sourceRefs: [geometryRef('sourceOccupancy', candidate.sourceOccupancy.toFixed(4))],
    });
  }
  if (candidate.fitMode === 'COVER' && candidate.retainedAreaRatio < CROP_SAFETY_THRESHOLDS.retainedAreaEvidenceWarnMax) {
    const severity = candidate.retainedAreaRatio < 0.35 ? 'HIGH' : 'MEDIUM';
    risks.push({
      code: 'LOW_RETAINED_AREA',
      severity,
      summary: `COVER retainedAreaRatio ${candidate.retainedAreaRatio.toFixed(4)}`,
      ruleIds: [RULE_IDS.CENTER_COVER_EVIDENCE],
      sourceRefs: [geometryRef('retainedAreaRatio', candidate.retainedAreaRatio.toFixed(4))],
    });
  }
  return risks;
}

export function validateCropCandidate(
  pack: HybridPackage,
  draft: CropCandidateDraft,
): Pick<
  SemanticCropCandidateV1,
  'safety' | 'status' | 'riskSignals' | 'positiveSignals' | 'constraintResults' | 'semanticCoverage' | 'evidenceCoverage' | 'textCoverage' | 'productUiCoverage' | 'navigationCoverage' | 'browserChromeCoverage'
> {
  const crop = draft.sourceRect;
  const regions = pack.hybrid.regions;
  const constraints = pack.cropInput.constraints;
  const claimLinks = pack.cropInput.claimLinks;
  const frames = pack.hybrid.temporalSummary.frameIds;
  const hardViolations: string[] = [];
  const warnings: string[] = [];
  const ruleIds = new Set<string>([RULE_IDS.SAMPLED_PRECISION, RULE_IDS.WORST_FRAME, ...draft.provenance.ruleIds]);
  const risks: CandidateRiskSignal[] = [...(draft.riskSignals ?? []), ...occupancyRisk(draft)];

  const constraintResults: ConstraintCoverageResult[] = constraints.map((constraint) => {
    const region = regions.find((item) => item.id === constraint.regionId);
    const coverage = region?.rect ? coverageOf(crop, region.rect) : 0;
    let satisfied = true;
    let hard = false;
    if (constraint.kind === 'MUST_KEEP') {
      hard = true;
      satisfied = coverage >= CROP_SAFETY_THRESHOLDS.mustKeepMin;
      ruleIds.add(RULE_IDS.MUST_KEEP_COVERAGE);
      if (!satisfied) hardViolations.push(`MUST_KEEP_LOSS:${constraint.regionId}`);
    } else if (constraint.kind === 'HARD_EXCLUDE') {
      hard = true;
      satisfied = coverage <= CROP_SAFETY_THRESHOLDS.hardExcludeMaxIncluded;
      ruleIds.add(RULE_IDS.HARD_EXCLUDE_INCLUDED);
      if (!satisfied) hardViolations.push(`HARD_EXCLUDE_INCLUDED:${constraint.regionId}`);
    } else if (constraint.kind === 'SHOULD_KEEP' && region && isChildShouldKeep(region, constraint)) {
      satisfied = coverage >= CROP_SAFETY_THRESHOLDS.shouldKeepMin;
      ruleIds.add(RULE_IDS.SHOULD_KEEP_COVERAGE);
      ruleIds.add(RULE_IDS.CHILD_REGION_PRIORITY);
      if (!satisfied) warnings.push(`SHOULD_KEEP_LOW:${constraint.semanticType}:${coverage.toFixed(3)}`);
    } else if (constraint.kind === 'SHOULD_KEEP' && region?.semanticType === 'PRODUCT_UI') {
      satisfied = coverage >= CROP_SAFETY_THRESHOLDS.productUiEnvelopeMin;
      ruleIds.add(RULE_IDS.PRODUCT_UI_ENVELOPE);
      if (!satisfied) warnings.push(`PRODUCT_UI_ENVELOPE_LOW:${coverage.toFixed(3)}`);
    } else if (constraint.kind === 'PREFER_EXCLUDE') {
      satisfied = coverage <= CROP_SAFETY_THRESHOLDS.browserChromePreferredMax;
      if (!satisfied && region?.semanticType === 'BROWSER_CHROME') {
        warnings.push('BROWSER_CHROME_INCLUDED');
        risks.push({
          code: 'BROWSER_CHROME_INCLUDED',
          severity: 'LOW',
          summary: `browser chrome coverage ${coverage.toFixed(3)} (presentation noise, not truth failure)`,
          ruleIds: [RULE_IDS.BROWSER_PREFER_EXCLUDE],
          sourceRefs: region.sourceRefs,
        });
      }
      if (!satisfied && region?.semanticType === 'LOCALHOST_REFERENCE') {
        warnings.push('LOCALHOST_INCLUDED');
        risks.push({
          code: 'LOCALHOST_INCLUDED',
          severity: 'LOW',
          summary: 'localhost included — presentation/trust, not fake/stale',
          ruleIds: [RULE_IDS.LOCALHOST_SOFT],
          sourceRefs: region.sourceRefs,
        });
      }
      ruleIds.add(RULE_IDS.BROWSER_PREFER_EXCLUDE);
    }
    return {
      regionId: constraint.regionId,
      semanticType: constraint.semanticType,
      kind: constraint.kind,
      coverage,
      satisfied,
      hard,
      ruleIds: constraint.ruleIds,
    };
  });

  const childKeep = regions.filter((region) => {
    const constraint = constraints.find((item) => item.regionId === region.id);
    return isChildShouldKeep(region, constraint);
  });
  const textRegions = regions.filter((item) => item.semanticType === 'TEXT_REGION' && item.rect);
  const productUiCoverage = coverageByType(crop, regions, 'PRODUCT_UI');
  const navigationCoverage = coverageByType(crop, regions, 'NAVIGATION');
  const textCoverage = meanCoverage(crop, textRegions);
  const evidenceCoverage = minCoverage(crop, evidenceRegions(regions));
  const browserChromeCoverage = coverageByType(crop, regions, 'BROWSER_CHROME');
  const localhostCoverage = coverageByType(crop, regions, 'LOCALHOST_REFERENCE');
  const semanticCoverage = meanCoverage(
    crop,
    regions.filter((item) => item.rect && item.semanticType !== 'BROWSER_CHROME' && item.semanticType !== 'LOCALHOST_REFERENCE'),
  );

  const childMin = minCoverage(crop, childKeep);
  if (childMin !== null && childMin < CROP_SAFETY_THRESHOLDS.shouldKeepMin) {
    risks.push({
      code: 'EVIDENCE_LOSS_RISK',
      severity: childMin < 0.35 ? 'HIGH' : 'MEDIUM',
      summary: `child SHOULD_KEEP min coverage ${childMin.toFixed(3)}`,
      ruleIds: [RULE_IDS.CHILD_REGION_PRIORITY, RULE_IDS.SHOULD_KEEP_COVERAGE],
      sourceRefs: [geometryRef('childShouldKeepMin', childMin.toFixed(4))],
    });
  }
  if (productUiCoverage !== null && productUiCoverage < 0.5) {
    risks.push({
      code: 'PRODUCT_IDENTITY_LOSS_RISK',
      severity: productUiCoverage < 0.35 ? 'HIGH' : 'MEDIUM',
      summary: `PRODUCT_UI envelope coverage ${productUiCoverage.toFixed(3)} (envelope, not 100% whole-surface requirement)`,
      ruleIds: [RULE_IDS.PRODUCT_UI_ENVELOPE],
      sourceRefs: [geometryRef('productUiCoverage', productUiCoverage.toFixed(4))],
    });
  }

  for (const link of claimLinks) {
    if (link.claimId === 'C5') {
      ruleIds.add(RULE_IDS.C5_NOT_CLAIM_CRITICAL);
      continue;
    }
    if (!link.claimCritical) continue;
    const mapped = link.semanticType === 'PRODUCT_UI' ? childMin : evidenceCoverage;
    if (mapped !== null && mapped < CROP_SAFETY_THRESHOLDS.claimCriticalMin) {
      risks.push({
        code: 'EVIDENCE_LOSS_RISK',
        severity: mapped < CROP_SAFETY_THRESHOLDS.claimCriticalSevereMax ? 'HIGH' : 'MEDIUM',
        summary: `claim ${link.claimId} evidence coverage ${mapped.toFixed(3)}`,
        ruleIds: [RULE_IDS.CLAIM_CRITICAL_COVERAGE],
        sourceRefs: [geometryRef('claim', link.claimId)],
      });
      if (mapped < CROP_SAFETY_THRESHOLDS.claimCriticalSevereMax) {
        hardViolations.push(`CLAIM_CRITICAL_SEVERE_LOSS:${link.claimId}`);
      } else {
        warnings.push(`CLAIM_CRITICAL_LOW:${link.claimId}`);
      }
    }
  }

  for (const region of textRegions) {
    const coverage = coverageOf(crop, region.rect!);
    const partial = coverage > 0 && coverage < 1 - 1e-9 && !containsRect(crop, region.rect!);
    if (partial) {
      warnings.push(`TEXT_CUTOFF:${region.id}`);
      risks.push({
        code: 'TEXT_CUTOFF_RISK',
        severity: coverage < CROP_SAFETY_THRESHOLDS.textNormalMin ? 'HIGH' : 'MEDIUM',
        summary: `TEXT_REGION partially cut coverage=${coverage.toFixed(3)}`,
        ruleIds: [RULE_IDS.TEXT_CUTOFF],
        sourceRefs: region.sourceRefs,
      });
    }
    const minText = region.flags.evidenceBearing ? CROP_SAFETY_THRESHOLDS.textCriticalMin : CROP_SAFETY_THRESHOLDS.textNormalMin;
    if (coverage < minText) {
      warnings.push(`TEXT_LOW:${region.id}`);
    }
  }

  const perFrame: PerFrameSafetyMetrics[] = frames.map((frameId) => {
    const frameRegions = regions.filter((item) => item.frameIds.includes(frameId));
    const frameChild = frameRegions.filter((region) => {
      const constraint = constraints.find((item) => item.regionId === region.id);
      return isChildShouldKeep(region, constraint);
    });
    const frameViolations: string[] = [];
    const frameWarnings: string[] = [];
    const nav = coverageByType(crop, frameRegions, 'NAVIGATION');
    const product = coverageByType(crop, frameRegions, 'PRODUCT_UI');
    const text = meanCoverage(
      crop,
      frameRegions.filter((item) => item.semanticType === 'TEXT_REGION'),
    );
    const browser = coverageByType(crop, frameRegions, 'BROWSER_CHROME');
    const evidence = minCoverage(crop, evidenceRegions(frameRegions));
    if (nav !== null && nav < CROP_SAFETY_THRESHOLDS.shouldKeepMin) frameWarnings.push('NAVIGATION_LOW');
    if (minCoverage(crop, frameChild) !== null && minCoverage(crop, frameChild)! < CROP_SAFETY_THRESHOLDS.shouldKeepMin) {
      frameWarnings.push('CHILD_SHOULD_KEEP_LOW');
    }
    for (const constraint of constraints) {
      const region = frameRegions.find((item) => item.id === constraint.regionId);
      if (!region?.rect) continue;
      const coverage = coverageOf(crop, region.rect);
      if (constraint.kind === 'MUST_KEEP' && coverage < CROP_SAFETY_THRESHOLDS.mustKeepMin) frameViolations.push('MUST_KEEP');
      if (constraint.kind === 'HARD_EXCLUDE' && coverage > CROP_SAFETY_THRESHOLDS.hardExcludeMaxIncluded) frameViolations.push('HARD_EXCLUDE');
    }
    return {
      frameId,
      productUiCoverage: product,
      navigationCoverage: nav,
      textCoverage: text,
      browserCoverage: browser,
      evidenceCoverage: evidence,
      violations: frameViolations,
      warnings: frameWarnings,
    };
  });

  const evidenceValues = perFrame.map((item) => item.evidenceCoverage).filter((item): item is number => item !== null);
  const worst = [...perFrame].sort((a, b) => {
    const av = a.evidenceCoverage ?? a.navigationCoverage ?? 1;
    const bv = b.evidenceCoverage ?? b.navigationCoverage ?? 1;
    return av - bv;
  })[0];
  const aggregate: AggregateSafetyMetrics = {
    productUiMin: minOf(perFrame.map((item) => item.productUiCoverage)),
    navigationMin: minOf(perFrame.map((item) => item.navigationCoverage)),
    textMin: minOf(perFrame.map((item) => item.textCoverage)),
    evidenceMin: minOf(perFrame.map((item) => item.evidenceCoverage)),
    browserMax: maxOf(perFrame.map((item) => item.browserCoverage)),
    medianEvidence: median(evidenceValues),
    worstFrameId: worst?.frameId ?? null,
    violationCount: perFrame.reduce((acc, item) => acc + item.violations.length, 0) + hardViolations.length,
  };

  if (aggregate.navigationMin !== null && aggregate.navigationMin < CROP_SAFETY_THRESHOLDS.shouldKeepMin) {
    warnings.push('WORST_FRAME_NAVIGATION_LOW');
  }

  const shouldKeepFail = childMin !== null && childMin < CROP_SAFETY_THRESHOLDS.shouldKeepMin;
  let status: CropCandidateStatus = 'VALID';
  if (hardViolations.length > 0) {
    status = 'UNSAFE';
  } else if (shouldKeepFail && (childMin ?? 1) < 0.35) {
    status = 'UNSAFE';
  } else if (warnings.length > 0 || risks.some((item) => item.severity === 'HIGH' || item.severity === 'MEDIUM') || shouldKeepFail) {
    status = 'VALID_WITH_WARNINGS';
  }

  const positive: CropPositiveSignal[] = [...(draft.positiveSignals ?? [])];
  if ((browserChromeCoverage ?? 1) <= 0.05) positive.push('BROWSER_CHROME_EXCLUDED');
  if (childMin !== null && childMin >= CROP_SAFETY_THRESHOLDS.shouldKeepMin) positive.push('KEY_EVIDENCE_PRESERVED');
  if (productUiCoverage !== null && productUiCoverage >= CROP_SAFETY_THRESHOLDS.productUiEnvelopeMin) positive.push('PRODUCT_IDENTITY_PRESERVED');
  if (textCoverage !== null && textCoverage >= CROP_SAFETY_THRESHOLDS.textNormalMin) positive.push('TEXT_PRESERVED');
  if (semanticCoverage !== null && semanticCoverage >= 0.8) positive.push('HIGH_SEMANTIC_COVERAGE');

  const uniquePositive = [...new Set(positive)];
  const uniqueRisks = dedupeRisks(risks);
  const safetyGroup: CropSafetyGroup = status === 'VALID' ? 'SAFE' : status === 'VALID_WITH_WARNINGS' ? 'WARNING' : 'UNSAFE';

  const preservedRegions: RegionCoverage[] = regions
    .filter((item) => item.rect && coverageOf(crop, item.rect) >= 0.95)
    .map((item) => ({ regionId: item.id, semanticType: item.semanticType, coverage: coverageOf(crop, item.rect!) }));
  const lostRegions: RegionCoverage[] = regions
    .filter((item) => item.rect && coverageOf(crop, item.rect) < 0.05)
    .map((item) => ({ regionId: item.id, semanticType: item.semanticType, coverage: coverageOf(crop, item.rect!) }));
  const partiallyCutRegions: RegionCoverage[] = regions
    .filter((item) => item.rect && coverageOf(crop, item.rect) > 0.05 && coverageOf(crop, item.rect) < 0.95)
    .map((item) => ({ regionId: item.id, semanticType: item.semanticType, coverage: coverageOf(crop, item.rect!) }));

  const safety: CropSafetyValidationResultV1 = {
    schemaVersion: CROP_SAFETY_VERSION,
    candidateId: draft.candidateId,
    status,
    hardViolations,
    warnings,
    preservedRegions,
    lostRegions,
    partiallyCutRegions,
    metrics: {
      retainedAreaRatio: draft.retainedAreaRatio,
      sourceOccupancy: draft.sourceOccupancy,
      productUiCoverage,
      navigationCoverage,
      textCoverage,
      evidenceCoverage,
      browserChromeCoverage,
      localhostCoverage,
    },
    perFrame,
    aggregate,
    safetyGroup,
    safetyPrecision: 'SAMPLED',
    ruleIds: [...ruleIds],
    sourceRefs: draft.provenance.sourceRefs,
  };

  return {
    safety,
    status,
    riskSignals: uniqueRisks,
    positiveSignals: uniquePositive,
    constraintResults,
    semanticCoverage,
    evidenceCoverage,
    textCoverage,
    productUiCoverage,
    navigationCoverage,
    browserChromeCoverage,
  };
}

function minOf(values: Array<number | null>): number | null {
  const nums = values.filter((item): item is number => item !== null);
  return nums.length ? Math.min(...nums) : null;
}

function maxOf(values: Array<number | null>): number | null {
  const nums = values.filter((item): item is number => item !== null);
  return nums.length ? Math.max(...nums) : null;
}

function dedupeRisks(risks: CandidateRiskSignal[]): CandidateRiskSignal[] {
  const seen = new Set<string>();
  const out: CandidateRiskSignal[] = [];
  for (const risk of risks) {
    const key = `${risk.code}:${risk.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(risk);
  }
  return out;
}

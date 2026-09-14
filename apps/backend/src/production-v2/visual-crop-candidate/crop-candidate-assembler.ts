import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { coverageOf, rectsIou } from './rect-math.js';
import { CROP_SAFETY_THRESHOLDS, RULE_IDS } from './threshold-config.js';
import { buildCandidateDrafts } from './candidate-generator.js';
import { validateCropCandidate } from './crop-safety-validator.js';
import type { CropCandidateGenerationResultV1, CropCandidateStatus, SemanticCropCandidateV1, StaticCropAssessment } from './crop-candidate.types.js';
import { SEMANTIC_CROP_CANDIDATE_VERSION, CROP_SAFETY_VERSION } from './crop-candidate.types.js';

const STATUS_ORDER: Record<CropCandidateStatus, number> = {
  VALID: 0,
  VALID_WITH_WARNINGS: 1,
  UNSAFE: 2,
  BLOCKED: 3,
};

function temporalVariance(pack: HybridPackage): boolean {
  const types = [...new Set(pack.hybrid.regions.map((item) => item.semanticType).filter(Boolean))] as string[];
  const frames = pack.hybrid.temporalSummary.frameIds;
  for (const type of types) {
    const ofType = pack.hybrid.regions.filter((item) => item.semanticType === type && item.rect);
    const frameSet = new Set(ofType.flatMap((item) => item.frameIds));
    if (frames.some((frameId) => !frameSet.has(frameId)) && ofType.length > 0) return true;
    const rects = ofType.map((item) => item.rect!);
    for (let i = 1; i < rects.length; i++) {
      if (rectsIou(rects[0], rects[i]) < 0.85) return true;
    }
  }
  return false;
}

function attachExplanation(candidate: SemanticCropCandidateV1): SemanticCropCandidateV1 {
  const preserved = candidate.safety.preservedRegions.map((item) => `${item.semanticType}:${item.coverage.toFixed(2)}`);
  const lost = candidate.safety.lostRegions.map((item) => `${item.semanticType}:${item.coverage.toFixed(2)}`);
  return {
    ...candidate,
    explanation: {
      whyGenerated: candidate.explanation.whyGenerated,
      preserved,
      lost,
      risks: candidate.riskSignals.map((item) => item.code),
      safetyWhy: `${candidate.status}; hard=${candidate.safety.hardViolations.length}; warnings=${candidate.safety.warnings.length}; precision=SAMPLED`,
    },
  };
}

export function generateSemanticCropCandidates(pack: HybridPackage): CropCandidateGenerationResultV1 {
  if (pack.hybrid.productionEligibility === 'BLOCKED' || pack.hybrid.status === 'BLOCKED' || pack.cropInput.status === 'BLOCKED') {
    return {
      schemaVersion: SEMANTIC_CROP_CANDIDATE_VERSION,
      safetySchemaVersion: CROP_SAFETY_VERSION,
      assetId: pack.hybrid.assetId,
      generationStatus: 'BLOCKED_BY_ASSET_USAGE',
      skipReason: 'PRODUCTION_ELIGIBILITY_BLOCKED',
      candidates: [],
      skippedStrategies: [
        { strategy: 'CONTAIN', reason: RULE_IDS.ASSET_USAGE_BLOCK },
        { strategy: 'CENTER_COVER', reason: RULE_IDS.ASSET_USAGE_BLOCK },
        { strategy: 'TOP_TRIM', reason: RULE_IDS.ASSET_USAGE_BLOCK },
        { strategy: 'UI_FOCUS', reason: RULE_IDS.ASSET_USAGE_BLOCK },
        { strategy: 'SAFE_REGION', reason: RULE_IDS.ASSET_USAGE_BLOCK },
      ],
      deduped: [],
      temporalVariance: false,
      staticCropAssessment: 'NOT_EVALUATED',
      safetyPrecision: 'SAMPLED',
      displayOrder: 'SAFE_THEN_WARNING_THEN_UNSAFE',
      winner: 'NOT_SELECTED',
      finalFitMode: 'NOT_SELECTED',
      directorDecision: 'NOT_PERFORMED',
      ffmpegExecuted: false,
    };
  }

  const { drafts, skipped } = buildCandidateDrafts(pack);
  const built: SemanticCropCandidateV1[] = drafts.map((draft) => {
    const validated = validateCropCandidate(pack, draft);
    return attachExplanation({
      ...draft,
      ...validated,
      explanation: draft.explanation,
    });
  });

  const variance = temporalVariance(pack);
  const withVariance = variance
    ? built.map((item) => ({
        ...item,
        riskSignals: [
          ...item.riskSignals,
          {
            code: 'TEMPORAL_REGION_VARIANCE' as const,
            severity: 'MEDIUM' as const,
            summary: 'sampled frames do not share identical region sets/rects',
            ruleIds: [RULE_IDS.SAMPLED_PRECISION],
            sourceRefs: item.provenance.sourceRefs,
          },
        ],
      }))
    : built;

  const { unique, deduped } = dedupSameStrategy(withVariance);

  const limited = unique.slice(0, CROP_SAFETY_THRESHOLDS.maxCandidates);
  limited.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.candidateId.localeCompare(b.candidateId));

  const staticCropAssessment = assessStatic(limited);
  if (staticCropAssessment === 'STATIC_CROP_INSUFFICIENT') {
    for (const candidate of limited) {
      candidate.riskSignals.push({
        code: 'STATIC_CROP_INSUFFICIENT',
        severity: 'HIGH',
        summary: 'no sampled-frame-static candidate is VALID/VALID_WITH_WARNINGS',
        ruleIds: [RULE_IDS.STATIC_ASSESSMENT],
        sourceRefs: candidate.provenance.sourceRefs,
      });
    }
  }

  return {
    schemaVersion: SEMANTIC_CROP_CANDIDATE_VERSION,
    safetySchemaVersion: CROP_SAFETY_VERSION,
    assetId: pack.hybrid.assetId,
    generationStatus: 'READY',
    candidates: limited,
    skippedStrategies: skipped,
    deduped,
    temporalVariance: variance,
    staticCropAssessment,
    safetyPrecision: 'SAMPLED',
    displayOrder: 'SAFE_THEN_WARNING_THEN_UNSAFE',
    winner: 'NOT_SELECTED',
    finalFitMode: 'NOT_SELECTED',
    directorDecision: 'NOT_PERFORMED',
    ffmpegExecuted: false,
  };
}

function assessStatic(candidates: readonly SemanticCropCandidateV1[]): StaticCropAssessment {
  const ok = candidates.filter((item) => item.status === 'VALID' || item.status === 'VALID_WITH_WARNINGS');
  if (ok.length === 0) return 'STATIC_CROP_INSUFFICIENT';
  const fullySafe = ok.filter((item) => item.status === 'VALID' && item.safety.perFrame.every((frame) => frame.violations.length === 0));
  if (fullySafe.length > 0) return 'SAFE_STATIC_CROP_AVAILABLE';
  return 'STATIC_CROP_WITH_WARNINGS';
}

export function strategyStatus(result: CropCandidateGenerationResultV1, strategy: SemanticCropCandidateV1['strategy']): CropCandidateStatus | 'NOT_GENERATED' {
  return result.candidates.find((item) => item.strategy === strategy)?.status ?? 'NOT_GENERATED';
}

export function coverageLostImportant(pack: HybridPackage, candidate: SemanticCropCandidateV1): boolean {
  return pack.hybrid.regions.some((region) => {
    if (!region.rect) return false;
    if (region.semanticType !== 'NAVIGATION' && region.semanticType !== 'CONTENT_PANEL') return false;
    return coverageOf(candidate.sourceRect, region.rect) < 0.8;
  });
}

export function dedupSameStrategy(candidates: readonly SemanticCropCandidateV1[]): {
  unique: SemanticCropCandidateV1[];
  deduped: CropCandidateGenerationResultV1['deduped'];
} {
  const deduped: CropCandidateGenerationResultV1['deduped'] = [];
  const unique: SemanticCropCandidateV1[] = [];
  for (const candidate of candidates) {
    const twin = unique.find(
      (item) => item.strategy === candidate.strategy && rectsIou(item.sourceRect, candidate.sourceRect) >= CROP_SAFETY_THRESHOLDS.iouDedupMin,
    );
    if (twin) {
      deduped.push({ droppedId: candidate.candidateId, keptId: twin.candidateId, iou: rectsIou(twin.sourceRect, candidate.sourceRect) });
      continue;
    }
    unique.push(candidate);
  }
  return { unique, deduped };
}

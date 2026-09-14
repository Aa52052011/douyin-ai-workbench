import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import { geometryRef, visionRef } from '../visual-hybrid/hybrid-provenance.js';
import type { HybridVisualRegion } from '../visual-hybrid/hybrid.types.js';
import { expandToCoverage, normalizeToTargetAspect } from './aspect-normalize.js';
import { computeSemanticEnvelope, evidenceRegions } from './coverage.js';
import type { CropCandidateDraft, CropCandidateStrategy, SemanticCropCandidateV1 } from './crop-candidate.types.js';
import { SEMANTIC_CROP_CANDIDATE_VERSION } from './crop-candidate.types.js';
import { occupancyForContain, retainedAreaRatio, centerCoverRect, fullSourceRect, toPixelRect } from './rect-math.js';
import { RULE_IDS } from './threshold-config.js';
import type { FitMode, NormalizedRect } from '../visual/geometry/types.js';

type Draft = CropCandidateDraft;

function childKeepRegions(pack: HybridPackage): HybridVisualRegion[] {
  return pack.hybrid.regions.filter((item) => {
    const kind = pack.cropInput.constraints.find((constraint) => constraint.regionId === item.id)?.kind;
    if (kind !== 'SHOULD_KEEP' && kind !== 'MUST_KEEP') return false;
    return item.semanticType === 'NAVIGATION' || item.semanticType === 'CONTENT_PANEL' || (item.semanticType === 'TEXT_REGION' && item.flags.evidenceBearing);
  });
}

function chromeBottom(regions: readonly HybridVisualRegion[]): number | null {
  const chrome = regions.filter((item) => item.semanticType === 'BROWSER_CHROME' && item.rect);
  if (chrome.length === 0) return null;
  return Math.max(...chrome.map((item) => item.rect!.y + item.rect!.height));
}

function finishDraft(
  pack: HybridPackage,
  input: {
    candidateId: string;
    strategy: CropCandidateStrategy;
    variant?: Draft['variant'];
    fitMode: FitMode;
    sourceRect: NormalizedRect;
    generatedFrom: Draft['generatedFrom'];
    whyGenerated: string;
    ruleIds: string[];
  },
): Draft {
  const profile = pack.cropInput.profile;
  const padRequired = input.fitMode === 'CONTAIN';
  const occupancy = input.fitMode === 'CONTAIN' ? occupancyForContain(input.sourceRect, profile) : 1;
  const pixelRect = toPixelRect(input.sourceRect, profile);
  return {
    schemaVersion: SEMANTIC_CROP_CANDIDATE_VERSION,
    candidateId: input.candidateId,
    strategy: input.strategy,
    variant: input.variant,
    fitMode: input.fitMode,
    sourceRect: input.sourceRect,
    pixelRect,
    outputRect: { width: profile.targetWidth, height: profile.targetHeight },
    normalizedCropRect: input.sourceRect,
    retainedAreaRatio: retainedAreaRatio(input.sourceRect),
    sourceOccupancy: occupancy,
    padRequired,
    aspectHandling: padRequired ? 'PAD_TO_ASPECT' : 'CROP_TO_ASPECT',
    explanation: {
      whyGenerated: input.whyGenerated,
      preserved: [],
      lost: [],
      risks: [],
      safetyWhy: 'pending-validation',
    },
    generatedFrom: input.generatedFrom,
    provenance: {
      sourceRefs: [geometryRef('candidate', input.candidateId), visionRef('hybrid-regions', pack.hybrid.assetId)],
      ruleIds: input.ruleIds,
    },
    safetyPrecision: 'SAMPLED',
    notFrameAccurate: true,
    winner: false,
    selected: false,
  };
}

export function buildCandidateDrafts(pack: HybridPackage): {
  drafts: Draft[];
  skipped: Array<{ strategy: CropCandidateStrategy; reason: string }>;
} {
  const skipped: Array<{ strategy: CropCandidateStrategy; reason: string }> = [];
  const drafts: Draft[] = [];
  const profile = pack.cropInput.profile;
  const regions = pack.hybrid.regions;
  const children = childKeepRegions(pack);
  const product = regions.filter((item) => item.semanticType === 'PRODUCT_UI');
  const evidence = evidenceRegions(regions);

  drafts.push(
    finishDraft(pack, {
      candidateId: 'crop:contain',
      strategy: 'CONTAIN',
      fitMode: 'CONTAIN',
      sourceRect: fullSourceRect(),
      generatedFrom: 'geometry',
      whyGenerated: 'B1 CONTAIN baseline — retain full source, pad to 9:16',
      ruleIds: [RULE_IDS.CONTAIN_OCCUPANCY, RULE_IDS.NO_STRETCH],
    }),
  );

  drafts.push(
    finishDraft(pack, {
      candidateId: 'crop:center-cover',
      strategy: 'CENTER_COVER',
      fitMode: 'COVER',
      sourceRect: centerCoverRect(profile),
      generatedFrom: 'geometry',
      whyGenerated: 'B1 centered COVER baseline — not auto-accepted',
      ruleIds: [RULE_IDS.CENTER_COVER_EVIDENCE],
    }),
  );

  const bottom = chromeBottom(regions);
  if (bottom === null) {
    skipped.push({ strategy: 'TOP_TRIM', reason: 'NO_OBSERVED_BROWSER_CHROME_REGION' });
  } else {
    const remaining: NormalizedRect = { x: 0, y: bottom, width: 1, height: 1 - bottom };
    drafts.push(
      finishDraft(pack, {
        candidateId: 'crop:top-trim',
        strategy: 'TOP_TRIM',
        fitMode: 'CONTAIN',
        sourceRect: remaining,
        generatedFrom: 'semantic',
        whyGenerated: 'Exclude observed BROWSER_CHROME band; keep remaining source with pad',
        ruleIds: [RULE_IDS.TOP_TRIM_FROM_CHROME, RULE_IDS.BROWSER_PREFER_EXCLUDE, RULE_IDS.NO_STRETCH],
      }),
    );
  }

  const focusSeed = computeSemanticEnvelope([...product, ...children, ...evidence]).rect;
  if (!focusSeed) {
    skipped.push({ strategy: 'UI_FOCUS', reason: 'NO_SEMANTIC_ENVELOPE' });
  } else {
    const expanded = expandToCoverage(focusSeed, children);
    const tight = normalizeToTargetAspect(expanded, profile, children.length ? children : evidence);
    drafts.push(
      finishDraft(pack, {
        candidateId: 'crop:ui-focus:tight',
        strategy: 'UI_FOCUS',
        variant: 'TIGHT',
        fitMode: 'COVER',
        sourceRect: tight.rect,
        generatedFrom: 'semantic',
        whyGenerated: 'UI_FOCUS TIGHT — 9:16 around evidence-region centroid, not source midpoint',
        ruleIds: [RULE_IDS.NO_BLIND_CENTER, RULE_IDS.ASPECT_EXPAND_FIRST, RULE_IDS.CHILD_REGION_PRIORITY],
      }),
    );
    drafts.push(
      finishDraft(pack, {
        candidateId: 'crop:ui-focus:balanced',
        strategy: 'UI_FOCUS',
        variant: 'BALANCED',
        fitMode: 'CONTAIN',
        sourceRect: expanded,
        generatedFrom: 'semantic',
        whyGenerated: 'UI_FOCUS BALANCED — semantic envelope with pad, no stretch',
        ruleIds: [RULE_IDS.NO_STRETCH, RULE_IDS.CHILD_REGION_PRIORITY],
      }),
    );
  }

  const safeSeed = computeSemanticEnvelope(children).rect;
  if (!safeSeed) {
    skipped.push({ strategy: 'SAFE_REGION', reason: 'NO_SHOULD_KEEP_CHILD_REGIONS' });
  } else {
    const expanded = expandToCoverage(safeSeed, children);
    drafts.push(
      finishDraft(pack, {
        candidateId: 'crop:safe-region',
        strategy: 'SAFE_REGION',
        fitMode: 'CONTAIN',
        sourceRect: expanded,
        generatedFrom: 'constraint',
        whyGenerated: 'SAFE_REGION — min envelope of SHOULD_KEEP child regions + pad to 9:16',
        ruleIds: [RULE_IDS.CHILD_REGION_PRIORITY, RULE_IDS.NO_STRETCH],
      }),
    );
  }

  return { drafts, skipped };
}

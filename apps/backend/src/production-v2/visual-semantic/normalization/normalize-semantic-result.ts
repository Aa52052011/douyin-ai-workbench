import { iouNormalized } from '../../visual/crop/rect-math.js';
import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { ProviderSemanticObservation, VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';
import { SEMANTIC_NORMALIZE_CONFIG } from './normalize-config.js';

function roundConfidence(value: number): number {
  const f = 10 ** SEMANTIC_NORMALIZE_CONFIG.confidenceDecimals;
  return Math.round(value * f) / f;
}

function regionKey(rect?: NormalizedRect): string {
  if (!rect) {
    return 'noregion';
  }
  return `${rect.x.toFixed(4)}:${rect.y.toFixed(4)}:${rect.width.toFixed(4)}:${rect.height.toFixed(4)}`;
}

function primaryFrame(observation: ProviderSemanticObservation): string {
  return observation.evidence.frameIds[0] ?? 'na';
}

function timestampOf(observation: ProviderSemanticObservation): number {
  return observation.startMs ?? 0;
}

export function stableObservationId(observation: ProviderSemanticObservation, ordinal: number): string {
  return `obs:${observation.type}:${primaryFrame(observation)}:${regionKey(observation.region)}:${ordinal}`;
}

function sameDuplicate(a: ProviderSemanticObservation, b: ProviderSemanticObservation): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (primaryFrame(a) !== primaryFrame(b)) {
    return false;
  }
  if (!a.region || !b.region) {
    return !a.region && !b.region;
  }
  return iouNormalized(a.region, b.region) >= SEMANTIC_NORMALIZE_CONFIG.duplicateIou;
}

function mergeDuplicate(a: ProviderSemanticObservation, b: ProviderSemanticObservation): ProviderSemanticObservation {
  const frameIds = [...new Set([...a.evidence.frameIds, ...b.evidence.frameIds])];
  const visualSignals = [...new Set([...(a.evidence.visualSignals ?? []), ...(b.evidence.visualSignals ?? [])])];
  return {
    ...a,
    confidence: Math.max(a.confidence, b.confidence),
    evidence: {
      frameIds,
      regions: a.evidence.regions ?? b.evidence.regions,
      textFragments: a.evidence.textFragments ?? b.evidence.textFragments,
      visualSignals: visualSignals.length ? visualSignals : a.evidence.visualSignals,
    },
  };
}

function dedupeObservations(observations: ProviderSemanticObservation[]): ProviderSemanticObservation[] {
  const kept: ProviderSemanticObservation[] = [];
  for (const item of observations) {
    const idx = kept.findIndex((existing) => sameDuplicate(existing, item));
    if (idx >= 0) {
      kept[idx] = mergeDuplicate(kept[idx], item);
    } else {
      kept.push(item);
    }
  }
  return kept;
}

function sortObservations(observations: ProviderSemanticObservation[]): ProviderSemanticObservation[] {
  return [...observations].sort((a, b) => {
    const ts = timestampOf(a) - timestampOf(b);
    if (ts !== 0) {
      return ts;
    }
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    const ay = a.region?.y ?? 0;
    const by = b.region?.y ?? 0;
    if (ay !== by) {
      return ay - by;
    }
    const ax = a.region?.x ?? 0;
    const bx = b.region?.x ?? 0;
    if (ax !== bx) {
      return ax - bx;
    }
    return a.observationId.localeCompare(b.observationId);
  });
}

function emptyArrays(result: VisualSemanticProviderResult): VisualSemanticProviderResult {
  return {
    ...result,
    observations: result.observations ?? [],
    semanticRegions: result.semanticRegions ?? [],
    uiFocusCandidates: result.uiFocusCandidates ?? [],
    subjectCandidates: result.subjectCandidates ?? [],
    browserChromeObservations: result.browserChromeObservations ?? [],
    developerArtifactObservations: result.developerArtifactObservations ?? [],
    authenticityObservations: result.authenticityObservations ?? [],
    watermarkObservations: result.watermarkObservations ?? [],
    privacyObservations: result.privacyObservations ?? [],
    textEvidence: result.textEvidence ?? [],
    moduleResults: result.moduleResults ?? [],
    warnings: result.warnings ?? [],
  };
}

export function normalizeVisualSemanticProviderResult(result: VisualSemanticProviderResult): VisualSemanticProviderResult {
  const withArrays = emptyArrays(result);
  const deduped = dedupeObservations(withArrays.observations.map((o) => ({ ...o, confidence: roundConfidence(o.confidence) })));
  const withIds = deduped.map((observation, ordinal) => ({
    ...observation,
    observationId: stableObservationId(observation, ordinal),
  }));
  const observations = sortObservations(withIds).map((observation, ordinal) => ({
    ...observation,
    observationId: stableObservationId(observation, ordinal),
  }));
  return {
    ...withArrays,
    observations,
    semanticRegions: [...withArrays.semanticRegions].sort((a, b) => a.regionId.localeCompare(b.regionId)),
  };
}

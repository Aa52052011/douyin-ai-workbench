import type { HybridPackage } from '../visual-hybrid/hybrid-assembler.js';
import type { HybridVisualRegion, SemanticObservationLite } from '../visual-hybrid/hybrid.types.js';
import { normalizeToTargetAspect } from '../visual-crop-candidate/aspect-normalize.js';
import { coverageOf, rectArea, rectsIou } from '../visual-crop-candidate/rect-math.js';
import { intentReadabilityTarget } from './mobile-readability.js';
import { DYNAMIC_REFRAME_THRESHOLDS as T } from './thresholds.js';
import {
  DYNAMIC_REFRAME_PLAN_VERSION,
  type DynamicReframePlanV1,
  type DynamicReframeSegmentV1,
  type ReadabilityTarget,
  type ReframeIntent,
} from './types.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

export type PlannerObservation = SemanticObservationLite;

export type PlanDynamicReframeInput = {
  pack: HybridPackage;
  observations: readonly PlannerObservation[];
  durationMs?: number;
  sourceCandidateRef?: string;
};

type SampleWindow = {
  timestampMs: number;
  startMs: number;
  endMs: number;
  types: Set<string>;
  regions: HybridVisualRegion[];
  frameId: string;
};

export function parseSampledTimestampMs(frameId: string): number | null {
  const match = frameId.match(/:(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

function padRect(rect: NormalizedRect, pad: number): NormalizedRect {
  const x = Math.max(0, rect.x - rect.width * pad);
  const y = Math.max(0, rect.y - rect.height * pad);
  const x2 = Math.min(1, rect.x + rect.width * (1 + pad));
  const y2 = Math.min(1, rect.y + rect.height * (1 + pad));
  return { x, y, width: x2 - x, height: y2 - y };
}

function regionOfType(regions: readonly HybridVisualRegion[], type: string): HybridVisualRegion | undefined {
  return regions.find((item) => item.semanticType === type && item.rect);
}

function chromeCoverage(crop: NormalizedRect, regions: readonly HybridVisualRegion[]): number {
  const chrome = regions.filter((item) => item.semanticType === 'BROWSER_CHROME' && item.rect);
  if (chrome.length === 0) return 0;
  return Math.max(...chrome.map((item) => coverageOf(crop, item.rect!)));
}

function hardExcludeIncluded(crop: NormalizedRect, pack: HybridPackage, regions: readonly HybridVisualRegion[]): number {
  const hard = pack.cropInput.constraints.filter((item) => item.kind === 'HARD_EXCLUDE').map((item) => item.regionId);
  const rects = regions.filter((item) => hard.includes(item.id) && item.rect);
  if (rects.length === 0) return 0;
  return Math.max(...rects.map((item) => coverageOf(crop, item.rect!)));
}

function cropForRegion(pack: HybridPackage, region: HybridVisualRegion, windowRegions: readonly HybridVisualRegion[]): NormalizedRect | null {
  if (!region.rect) return null;
  const seeded = padRect(region.rect, T.focusPad);
  const aspect = normalizeToTargetAspect(seeded, pack.cropInput.profile, [region]);
  let rect = aspect.rect;
  const chrome = regionOfType(windowRegions, 'BROWSER_CHROME');
  if (chrome?.rect && chromeCoverage(rect, windowRegions) > T.chromeMaxCoverage) {
    const bottom = chrome.rect.y + chrome.rect.height;
    if (rect.y < bottom) {
      const height = Math.min(rect.height, 1 - bottom);
      if (height > 0.05) rect = { x: rect.x, y: bottom, width: rect.width, height };
    }
  }
  return rect;
}

function zoomLevel(crop: NormalizedRect): number {
  const area = rectArea(crop);
  return Number((1 / Math.max(area, 0.05)).toFixed(4));
}

function intentsForWindow(window: SampleWindow, isFirst: boolean, isLast: boolean): ReframeIntent[] {
  const intents: ReframeIntent[] = [];
  if (isFirst) intents.push('ESTABLISH_CONTEXT');
  if (window.types.has('TEXT_REGION')) intents.push('FOCUS_TEXT');
  if (window.types.has('CONTENT_PANEL')) intents.push('FOCUS_PRODUCT_UI');
  else if (window.types.has('NAVIGATION') && !window.types.has('TEXT_REGION')) intents.push('FOCUS_NAVIGATION');
  else if (window.types.has('PRODUCT_UI') && !isFirst) intents.push(isLast ? 'RETURN_TO_CONTEXT' : 'FOCUS_PRODUCT_UI');
  if (isLast && !intents.includes('RETURN_TO_CONTEXT') && !window.types.has('TEXT_REGION')) {
    intents.push('RETURN_TO_CONTEXT');
  }
  const unique: ReframeIntent[] = [];
  for (const intent of intents) {
    if (!unique.includes(intent)) unique.push(intent);
  }
  return unique.length ? unique : ['FOCUS_PRODUCT_UI'];
}

function focusRegion(intent: ReframeIntent, window: SampleWindow): HybridVisualRegion | undefined {
  if (intent === 'FOCUS_TEXT') return regionOfType(window.regions, 'TEXT_REGION');
  if (intent === 'FOCUS_NAVIGATION') return regionOfType(window.regions, 'NAVIGATION');
  if (intent === 'FOCUS_PRODUCT_UI') {
    return regionOfType(window.regions, 'CONTENT_PANEL') ?? regionOfType(window.regions, 'PRODUCT_UI');
  }
  return regionOfType(window.regions, 'PRODUCT_UI') ?? window.regions.find((item) => item.rect);
}

function minHold(intent: ReframeIntent): number {
  if (intent === 'FOCUS_TEXT') return T.minHoldTextMs;
  if (intent === 'ESTABLISH_CONTEXT' || intent === 'RETURN_TO_CONTEXT') return T.minHoldContextMs;
  return T.minHoldUiMs;
}

function claimRefsFor(intent: ReframeIntent, pack: HybridPackage): string[] {
  const supported = pack.cropInput.claimLinks
    .filter((item) => item.claimId !== 'C5' && item.claimId !== 'C6' && item.support !== 'CONTRADICTED' && item.support !== 'INSUFFICIENT')
    .map((item) => item.claimId);
  if (intent === 'ESTABLISH_CONTEXT' || intent === 'RETURN_TO_CONTEXT') {
    return supported.filter((id) => id === 'C1');
  }
  if (intent === 'FOCUS_NAVIGATION' || intent === 'FOCUS_PRODUCT_UI') {
    return supported.filter((id) => id === 'C2' || id === 'C4' || id === 'C3' || id === 'C1');
  }
  if (intent === 'FOCUS_TEXT') return supported.filter((id) => id === 'C1' || id === 'C4');
  return supported.filter((id) => id !== 'C5' && id !== 'C6');
}

function buildWindows(observations: readonly PlannerObservation[], pack: HybridPackage, durationMs: number): SampleWindow[] {
  const byFrame = new Map<string, PlannerObservation[]>();
  for (const item of observations) {
    const list = byFrame.get(item.frameId) ?? [];
    list.push(item);
    byFrame.set(item.frameId, list);
  }
  const stamps = [...byFrame.keys()]
    .map((frameId) => ({ frameId, ts: parseSampledTimestampMs(frameId) }))
    .filter((item): item is { frameId: string; ts: number } => item.ts != null)
    .sort((a, b) => a.ts - b.ts || a.frameId.localeCompare(b.frameId));
  if (stamps.length === 0) return [];
  return stamps.map((stamp, index) => {
    const prev = index === 0 ? 0 : Math.round((stamps[index - 1].ts + stamp.ts) / 2);
    const next = index === stamps.length - 1 ? durationMs : Math.round((stamp.ts + stamps[index + 1].ts) / 2);
    const fromPack = pack.hybrid.regions.filter((item) => item.frameIds.includes(stamp.frameId));
    const observations = byFrame.get(stamp.frameId)!;
    const types = new Set(observations.map((item) => item.type));
    const regions =
      fromPack.length > 0
        ? fromPack
        : observations
            .filter((item) => item.region)
            .map((item, regionIndex) => ({
              id: `synth:${stamp.frameId}:${item.type}:${regionIndex}`,
              semanticType: item.type,
              rect: item.region,
              frameIds: [stamp.frameId],
              sourceRefs: [],
              flags: {},
              confidence: item.confidence,
            }));
    return { timestampMs: stamp.ts, startMs: prev, endMs: next, types, regions, frameId: stamp.frameId };
  });
}

function splitWindow(window: SampleWindow, intents: ReframeIntent[]): Array<{ intent: ReframeIntent; startMs: number; endMs: number }> {
  const span = window.endMs - window.startMs;
  if (intents.length === 1) return [{ intent: intents[0], startMs: window.startMs, endMs: window.endMs }];
  const holds = intents.map((intent, index) => {
    if (intent === 'ESTABLISH_CONTEXT') return Math.min(T.establishContextMaxMs, span);
    return minHold(intent) + (index === intents.length - 1 ? 0 : 0);
  });
  const reserved = holds.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, span - reserved);
  const lastBoost = extra;
  const out: Array<{ intent: ReframeIntent; startMs: number; endMs: number }> = [];
  let cursor = window.startMs;
  intents.forEach((intent, index) => {
    const dur = holds[index] + (index === intents.length - 1 ? lastBoost : 0);
    const end = index === intents.length - 1 ? window.endMs : Math.min(window.endMs, cursor + dur);
    out.push({ intent, startMs: cursor, endMs: end });
    cursor = end;
  });
  return out.filter((item) => item.endMs > item.startMs);
}

function auditSegment(
  pack: HybridPackage,
  window: SampleWindow,
  crop: NormalizedRect,
  intent: ReframeIntent,
): { warnings: string[]; unsafe: boolean; requestShotSplit: boolean } {
  const warnings: string[] = [];
  const hard = hardExcludeIncluded(crop, pack, window.regions);
  if (hard > T.hardExcludeMaxIncluded) return { warnings: ['UNSAFE_HARD_EXCLUDE'], unsafe: true, requestShotSplit: true };
  if (window.types.has('LOCALHOST_REFERENCE') && regionOfType(window.regions, 'LOCALHOST_REFERENCE')) {
    const local = regionOfType(window.regions, 'LOCALHOST_REFERENCE')!;
    if (local.rect && coverageOf(crop, local.rect) > T.hardExcludeMaxIncluded) {
      return { warnings: ['UNSAFE_LOCALHOST'], unsafe: true, requestShotSplit: true };
    }
  }
  if (chromeCoverage(crop, window.regions) > T.chromeMaxCoverage) warnings.push('BROWSER_CHROME_SOFT');
  const text = regionOfType(window.regions, 'TEXT_REGION');
  if (intent === 'FOCUS_TEXT' && text?.rect && coverageOf(crop, text.rect) < T.claimCriticalTextMinCoverage) {
    warnings.push('TEXT_COVERAGE_SHORTFALL');
    return { warnings, unsafe: false, requestShotSplit: true };
  }
  const button = regionOfType(window.regions, 'BUTTON_LIKE_REGION');
  if (intent === 'FOCUS_ACTION' && button) warnings.push('C5_BUTTON_NOT_CLAIM_CRITICAL');
  return { warnings, unsafe: false, requestShotSplit: false };
}

function mergeSegments(segments: DynamicReframeSegmentV1[]): DynamicReframeSegmentV1[] {
  const out: DynamicReframeSegmentV1[] = [];
  for (const segment of segments) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.intent === segment.intent &&
      rectsIou(prev.cropRectNormalized, segment.cropRectNormalized) >= T.mergeIouMin
    ) {
      prev.endMs = Math.max(prev.endMs, segment.endMs);
      prev.evidenceRefs = [...new Set([...prev.evidenceRefs, ...segment.evidenceRefs])].sort();
      prev.claimRefs = [...new Set([...prev.claimRefs, ...segment.claimRefs])].sort();
      continue;
    }
    out.push({ ...segment, cropRectNormalized: { ...segment.cropRectNormalized } });
  }
  return out;
}

function absorbShort(segments: DynamicReframeSegmentV1[]): DynamicReframeSegmentV1[] {
  const items = segments.map((item) => ({ ...item, cropRectNormalized: { ...item.cropRectNormalized } }));
  let changed = true;
  while (changed && items.length > 1) {
    changed = false;
    const shortAt = items.findIndex((item) => item.endMs - item.startMs < T.minAvgReframeIntervalMs);
    if (shortAt < 0) break;
    const keepAt = shortAt === 0 ? 1 : shortAt - 1;
    const drop = items[shortAt];
    const keep = items[keepAt];
    keep.startMs = Math.min(keep.startMs, drop.startMs);
    keep.endMs = Math.max(keep.endMs, drop.endMs);
    keep.evidenceRefs = [...new Set([...keep.evidenceRefs, ...drop.evidenceRefs])].sort();
    items.splice(shortAt, 1);
    changed = true;
  }
  return items;
}

function rejectMechanical(segments: DynamicReframeSegmentV1[]): DynamicReframeSegmentV1[] {
  return mergeSegments(absorbShort(segments));
}

function clipOverlaps(segments: DynamicReframeSegmentV1[]): DynamicReframeSegmentV1[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs || a.segmentId.localeCompare(b.segmentId));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMs < sorted[i - 1].endMs) sorted[i].startMs = sorted[i - 1].endMs;
  }
  return sorted.filter((item) => item.endMs > item.startMs);
}

export function planDynamicReframe(input: PlanDynamicReframeInput): DynamicReframePlanV1 {
  const durationMs = input.durationMs ?? T.sourceDurationMs;
  const windows = buildWindows(input.observations, input.pack, durationMs);
  const raw: DynamicReframeSegmentV1[] = [];
  let seq = 0;
  windows.forEach((window, index) => {
    const intents = intentsForWindow(window, index === 0, index === windows.length - 1);
    for (const slice of splitWindow(window, intents)) {
      const region = focusRegion(slice.intent, window);
      if (!region?.rect) continue;
      const crop = cropForRegion(input.pack, region, window.regions);
      if (!crop) continue;
      const audit = auditSegment(input.pack, window, crop, slice.intent);
      if (audit.unsafe) continue;
      const claimCriticalText = slice.intent === 'FOCUS_TEXT';
      const target: ReadabilityTarget = intentReadabilityTarget(slice.intent, claimCriticalText);
      seq += 1;
      const hold = minHold(slice.intent);
      const endMs = Math.max(slice.endMs, slice.startMs + Math.min(hold, window.endMs - slice.startMs));
      raw.push({
        segmentId: `seg:${String(seq).padStart(2, '0')}:${slice.intent}`,
        startMs: slice.startMs,
        endMs: Math.min(endMs, durationMs),
        intent: slice.intent,
        focusRegionRef: region.id,
        cropRectNormalized: crop,
        zoomLevel: zoomLevel(crop),
        fitMode: slice.intent === 'ESTABLISH_CONTEXT' || slice.intent === 'RETURN_TO_CONTEXT' ? 'CONTAIN' : 'COVER',
        targetReadability: target,
        transitionIn: slice.intent === 'ESTABLISH_CONTEXT' ? 'CUT' : 'EASED_ZOOM',
        transitionOut: 'HOLD',
        evidenceRefs: [window.frameId, region.semanticType ?? region.id].sort(),
        claimRefs: claimRefsFor(slice.intent, input.pack).sort(),
        confidence: region.confidence ?? 0.5,
        safetyPrecision: 'SAMPLED',
        warnings: [...audit.warnings, 'SAMPLED_BOUNDARY_MARGIN'].sort(),
        requestShotSplit: audit.requestShotSplit || undefined,
      });
    }
  });
  const merged = rejectMechanical(mergeSegments(clipOverlaps(raw))).map((item, index) => ({
    ...item,
    segmentId: `seg:${String(index + 1).padStart(2, '0')}:${item.intent}`,
  }));
  if (merged[0]) merged[0].startMs = 0;
  if (merged.length) merged[merged.length - 1].endMs = durationMs;
  const covered = clipOverlaps(merged);
  const gaps: Array<{ startMs: number; endMs: number; reason: string }> = [];
  let cursor = 0;
  for (const segment of covered) {
    if (segment.startMs > cursor) gaps.push({ startMs: cursor, endMs: segment.startMs, reason: 'SOURCE_NOT_USED' });
    cursor = Math.max(cursor, segment.endMs);
  }
  if (cursor < durationMs) gaps.push({ startMs: cursor, endMs: durationMs, reason: 'SOURCE_NOT_USED' });

  return {
    schemaVersion: DYNAMIC_REFRAME_PLAN_VERSION,
    assetId: input.pack.hybrid.assetId,
    sourceCandidateRef: input.sourceCandidateRef ?? 'crop:top-trim',
    targetProfile: { width: 720, height: 1280 },
    mobileReadabilityStandard: 'DOUYIN_DEFAULT_MOBILE_VIEW',
    segments: covered,
    coverage: { startMs: 0, endMs: durationMs, fullSource: gaps.length === 0, gaps },
    globalConstraints: {
      safetyFirst: true,
      truthFirst: true,
      timingPrecision: 'SAMPLED',
      antiMechanical: true,
      noFakeUi: true,
      c5MustNotBoost: true,
    },
    transitions: {
      preferred: ['CUT', 'HOLD', 'EASED_ZOOM'],
      avoided: ['BOUNCE', 'SPIN', 'FLASHY'],
      executedThisStep: false,
    },
    humanReviewRequirements: { requiredAfterRepair: true, priorStaticApprovalReusable: false },
    provenance: { planner: 'deterministic', visionCalls: 0, llmCalls: 0, ffmpegCalls: 0 },
  };
}

export function c5Boosted(plan: DynamicReframePlanV1): boolean {
  return plan.segments.some((item) => item.claimRefs.includes('C5') && item.targetReadability === 'CLAIM_CRITICAL_READABLE');
}

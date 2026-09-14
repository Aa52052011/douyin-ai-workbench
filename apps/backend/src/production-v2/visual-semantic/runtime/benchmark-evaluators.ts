import { iouNormalized } from '../../visual/crop/rect-math.js';
import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { VisualSemanticObservationType } from '../contracts/observation.types.js';
import type { ProviderSemanticObservation, VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';
import type { SyntheticFrameManifest } from './synthetic-benchmark-frames.js';

export type LatencyAssessment = 'GOOD' | 'ACCEPTABLE' | 'HIGH' | 'TOO_HIGH';

export function assessLatency(ms: number): LatencyAssessment {
  if (ms <= 60_000) return 'GOOD';
  if (ms <= 90_000) return 'ACCEPTABLE';
  if (ms <= 150_000) return 'HIGH';
  return 'TOO_HIGH';
}

export function observationFrameId(item: ProviderSemanticObservation): string | undefined {
  return item.evidence.frameIds[0];
}

export function evaluateFrameIdentity(
  result: VisualSemanticProviderResult,
  allowedFrameIds: readonly string[],
): { status: 'PASS' | 'FAIL'; missing: number; unknown: number } {
  let missing = 0;
  let unknown = 0;
  for (const item of result.observations) {
    const frameId = observationFrameId(item);
    if (!frameId) {
      missing += 1;
      continue;
    }
    if (!allowedFrameIds.includes(frameId)) {
      unknown += 1;
    }
  }
  return { status: missing === 0 && unknown === 0 ? 'PASS' : 'FAIL', missing, unknown };
}

export function evaluateContamination(
  result: VisualSemanticProviderResult,
  manifests: SyntheticFrameManifest[],
): { count: number; rate: number; hits: string[] } {
  const byId = new Map(manifests.map((item) => [item.frameId, item]));
  const hits: string[] = [];
  for (const item of result.observations) {
    const frameId = observationFrameId(item);
    if (!frameId) continue;
    const blob = `${(item.evidence.visualSignals ?? []).join(' ')} ${(item.evidence.textFragments ?? []).map((frag) => frag.text).join(' ')}`.toUpperCase();
    for (const other of manifests) {
      if (other.frameId === frameId) continue;
      if (blob.includes(other.uniqueToken)) {
        hits.push(`${frameId}->${other.frameId}:${other.uniqueToken}`);
      }
    }
    void byId;
  }
  const rate = result.observations.length === 0 ? 0 : hits.length / result.observations.length;
  return { count: hits.length, rate, hits };
}

export function evaluatePrecisionRecall(
  result: VisualSemanticProviderResult,
  manifests: SyntheticFrameManifest[],
): { precision: number; recall: number; trueSupported: number; returned: number; expected: number; detectedExpected: number } {
  const byId = new Map(manifests.map((item) => [item.frameId, item]));
  let trueSupported = 0;
  for (const item of result.observations) {
    const frameId = observationFrameId(item);
    const manifest = frameId ? byId.get(frameId) : undefined;
    if (!manifest) continue;
    const allowed = new Set([...manifest.expectedTypes, ...manifest.optionalTypes]);
    if (allowed.has(item.type)) {
      trueSupported += 1;
    }
  }
  let expected = 0;
  let detectedExpected = 0;
  for (const manifest of manifests) {
    const types = new Set(
      result.observations.filter((item) => observationFrameId(item) === manifest.frameId).map((item) => item.type),
    );
    for (const type of manifest.expectedTypes) {
      expected += 1;
      if (types.has(type)) {
        detectedExpected += 1;
      }
    }
  }
  return {
    precision: result.observations.length === 0 ? 0 : trueSupported / result.observations.length,
    recall: expected === 0 ? 0 : detectedExpected / expected,
    trueSupported,
    returned: result.observations.length,
    expected,
    detectedExpected,
  };
}

export function evaluateBrowser(
  result: VisualSemanticProviderResult,
  manifests: SyntheticFrameManifest[],
): { fp: number; tp: number; fn: number } {
  let fp = 0;
  let tp = 0;
  let fn = 0;
  for (const manifest of manifests) {
    const has = result.observations.some(
      (item) => observationFrameId(item) === manifest.frameId && item.type === 'BROWSER_CHROME',
    );
    if (manifest.hasBrowserChrome) {
      if (has) tp += 1;
      else fn += 1;
    } else if (has) {
      fp += 1;
    }
  }
  return { fp, tp, fn };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function evaluateRegions(
  result: VisualSemanticProviderResult,
  manifests: SyntheticFrameManifest[],
): { meanIoU: number | null; medianIoU: number | null; ge30: number; ge50: number; samples: number } {
  const ious: number[] = [];
  const targetTypes: VisualSemanticObservationType[] = ['NAVIGATION', 'CONTENT_PANEL', 'BUTTON_LIKE_REGION', 'CARD'];
  for (const manifest of manifests) {
    for (const gt of manifest.approxRegions.filter((item) => targetTypes.includes(item.type))) {
      const candidates = result.observations.filter(
        (item) => observationFrameId(item) === manifest.frameId && item.type === gt.type && item.region,
      );
      let best = 0;
      for (const candidate of candidates) {
        best = Math.max(best, iouNormalized(gt.rect, candidate.region as NormalizedRect));
      }
      if (candidates.length > 0) {
        ious.push(best);
      }
    }
  }
  const mean = ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : null;
  return {
    meanIoU: mean,
    medianIoU: median(ious),
    ge30: ious.filter((value) => value >= 0.3).length,
    ge50: ious.filter((value) => value >= 0.5).length,
    samples: ious.length,
  };
}

function normalizeText(value: string): string {
  return value.toUpperCase().replace(/[\s,.;:：，。]/g, '');
}

export function evaluateText(
  result: VisualSemanticProviderResult,
  manifests: SyntheticFrameManifest[],
): {
  exact: number;
  near: number;
  missed: number;
  regionDetected: number;
  status: 'OBSERVED' | 'PARTIAL' | 'NOT_OBSERVED';
} {
  let exact = 0;
  let near = 0;
  let missed = 0;
  let regionDetected = 0;
  for (const manifest of manifests) {
    const frameObs = result.observations.filter((item) => observationFrameId(item) === manifest.frameId);
    if (frameObs.some((item) => item.type === 'TEXT_REGION')) {
      regionDetected += 1;
    }
    const blob = frameObs
      .flatMap((item) => [...(item.evidence.visualSignals ?? []), ...(item.evidence.textFragments ?? []).map((frag) => frag.text)])
      .join(' ');
    const normalizedBlob = normalizeText(blob);
    for (const expected of manifest.expectedText) {
      if (blob.toUpperCase().includes(expected.toUpperCase())) {
        exact += 1;
      } else if (normalizedBlob.includes(normalizeText(expected))) {
        near += 1;
      } else {
        missed += 1;
      }
    }
  }
  const status = exact + near === 0 ? 'NOT_OBSERVED' : missed === 0 ? 'OBSERVED' : 'PARTIAL';
  return { exact, near, missed, regionDetected, status };
}

export function aggregatePerFrameObservations(result: VisualSemanticProviderResult): Array<{
  type: VisualSemanticObservationType;
  frameIds: string[];
  count: number;
  firstIndex: number;
  lastIndex: number;
}> {
  const map = new Map<VisualSemanticObservationType, { frameIds: string[]; indices: number[] }>();
  result.observations.forEach((item, index) => {
    const frameId = observationFrameId(item) ?? 'unknown';
    const entry = map.get(item.type) ?? { frameIds: [], indices: [] };
    if (!entry.frameIds.includes(frameId)) {
      entry.frameIds.push(frameId);
    }
    entry.indices.push(index);
    map.set(item.type, entry);
  });
  return [...map.entries()].map(([type, entry]) => ({
    type,
    frameIds: entry.frameIds,
    count: entry.indices.length,
    firstIndex: Math.min(...entry.indices),
    lastIndex: Math.max(...entry.indices),
  }));
}

export function pipelinePass(layers: {
  transport: string;
  json: string;
  model: string;
  b2: string;
}): boolean {
  return layers.transport === 'PASS' && layers.json === 'PASS' && layers.model === 'PASS' && layers.b2 === 'PASS';
}

export function shouldRunSixImage(threePipelinePass: boolean): boolean {
  return threePipelinePass;
}

export function shouldRunOptionalText(sixPipelinePass: boolean, sixLatencyMs: number | null, schemaStable: boolean): boolean {
  return sixPipelinePass && schemaStable && sixLatencyMs != null && sixLatencyMs <= 150_000;
}

export function decisionLeakage(result: VisualSemanticProviderResult): 'NONE' | 'INVALID' {
  const blob = JSON.stringify(result);
  for (const key of ['assetUsage', 'bestCrop', 'safeToCrop', 'recommendedCrop', 'projectRelevance']) {
    if (blob.includes(key)) {
      return 'INVALID';
    }
  }
  return 'NONE';
}

import type { NormalizedRect } from '../../visual/geometry/types.js';
import {
  classifyRegionRelationship,
  isSemanticRegionConflictCandidate,
  type RegionRelationshipKind,
  type RegionRelationshipResult,
} from './region-relationship.js';

export const B2_6_CALL_A_TYPE_COUNTS = {
  PRODUCT_UI: 0,
  NAVIGATION: 6,
  BROWSER_CHROME: 6,
  CONTENT_PANEL: 10,
} as const;

export const TEXT_EVIDENCE_MAX_FRAMES = 3;
export const B2_6A_INFERENCE_MAX = 2;
export const B2_6A_CALL_B_FORBIDDEN_COMBO = ['TEXT_EVIDENCE', 'DEVELOPER_ARTIFACT'] as const;

export const PRODUCT_UI_PROMPT_DEFINITION =
  'PRODUCT_UI means the visible application/product interface as a whole or a major application surface, not merely one child control.';

export const PRODUCT_UI_PROMPT_NON_FORCE =
  'Do not emit PRODUCT_UI if the frame only shows browser chrome, OS chrome, a document, or unrelated visual content.';

export type TypedRegion = {
  frameId: string;
  type: string;
  region: NormalizedRect;
  visualSignals?: string[];
  text?: string[];
};

export function countTypes(items: ReadonlyArray<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

export function framesWithType(items: ReadonlyArray<{ type: string; frameId: string }>, type: string): Set<string> {
  return new Set(items.filter((item) => item.type === type).map((item) => item.frameId));
}

export function firstTypedRegion(
  items: readonly TypedRegion[],
  frameId: string,
  type: string,
): TypedRegion | undefined {
  return items.find((item) => item.frameId === frameId && item.type === type && item.region);
}

export function pairRelationship(
  a: TypedRegion | undefined,
  b: TypedRegion | undefined,
): (RegionRelationshipResult & { typeA: string; typeB: string; conflictCandidate: boolean }) | null {
  if (!a || !b) return null;
  const rel = classifyRegionRelationship(a.region, b.region);
  return {
    ...rel,
    typeA: a.type,
    typeB: b.type,
    conflictCandidate: isSemanticRegionConflictCandidate({
      typeA: a.type,
      typeB: b.type,
      relationship: rel.relationship,
      iou: rel.iou,
    }),
  };
}

export type ReclassBucket = 'trueConflict' | 'adjacent' | 'containment' | 'ambiguous' | 'disjoint';

export function bucketRelationship(kind: RegionRelationshipKind, conflict: boolean): ReclassBucket {
  if (conflict) return 'trueConflict';
  if (kind === 'ADJACENT') return 'adjacent';
  if (kind === 'CONTAINS' || kind === 'CONTAINED_BY') return 'containment';
  if (kind === 'DISJOINT') return 'disjoint';
  return 'ambiguous';
}

export function reclassifyBrowserNavPairs(items: readonly TypedRegion[]): {
  trueConflictCount: number;
  adjacentCount: number;
  containmentCount: number;
  ambiguousCount: number;
  disjointCount: number;
  perFrame: Array<{
    frameId: string;
    relationship: RegionRelationshipKind | 'MISSING';
    iou: number | null;
    conflictCandidate: boolean;
    bucket: ReclassBucket | 'MISSING';
  }>;
} {
  const frameIds = [...new Set(items.map((item) => item.frameId))];
  const perFrame = frameIds.map((frameId) => {
    const rel = pairRelationship(
      firstTypedRegion(items, frameId, 'BROWSER_CHROME'),
      firstTypedRegion(items, frameId, 'NAVIGATION'),
    );
    if (!rel) {
      return { frameId, relationship: 'MISSING' as const, iou: null, conflictCandidate: false, bucket: 'MISSING' as const };
    }
    return {
      frameId,
      relationship: rel.relationship,
      iou: rel.iou,
      conflictCandidate: rel.conflictCandidate,
      bucket: bucketRelationship(rel.relationship, rel.conflictCandidate),
    };
  });
  return {
    trueConflictCount: perFrame.filter((item) => item.bucket === 'trueConflict').length,
    adjacentCount: perFrame.filter((item) => item.bucket === 'adjacent').length,
    containmentCount: perFrame.filter((item) => item.bucket === 'containment').length,
    ambiguousCount: perFrame.filter((item) => item.bucket === 'ambiguous').length,
    disjointCount: perFrame.filter((item) => item.bucket === 'disjoint').length,
    perFrame,
  };
}

export type FrameSelectionHint = {
  frameId: string;
  textRich: boolean;
  addressBarVisible: boolean;
};

export function scoreTextEvidenceCandidate(item: FrameSelectionHint): number {
  return (item.textRich ? 2 : 0) + (item.addressBarVisible ? 1 : 0);
}

export function selectTextEvidenceFrames(hints: readonly FrameSelectionHint[], max = TEXT_EVIDENCE_MAX_FRAMES): {
  frameIds: string[];
  mode: 'targeted_validation';
  note: string;
} {
  const ranked = [...hints].sort((a, b) => scoreTextEvidenceCandidate(b) - scoreTextEvidenceCandidate(a));
  const picked: string[] = [];
  const address = ranked.find((item) => item.addressBarVisible);
  const textRich = ranked.find((item) => item.textRich && item.frameId !== address?.frameId);
  const rest = ranked.filter((item) => item.frameId !== address?.frameId && item.frameId !== textRich?.frameId);
  if (address) picked.push(address.frameId);
  if (textRich && picked.length < max) picked.push(textRich.frameId);
  for (const item of rest) {
    if (picked.length >= max) break;
    picked.push(item.frameId);
  }
  return {
    frameIds: picked.slice(0, max),
    mode: 'targeted_validation',
    note: 'Selected from Call A text-rich and address-bar-visible hints. Not an unbiased localhost benchmark.',
  };
}

export function buildFrameHintsFromObservations(
  items: ReadonlyArray<{ type: string; frameId: string; visualSignals?: string[]; text?: Array<{ text?: string }> }>,
  allFrameIds: readonly string[],
): FrameSelectionHint[] {
  return allFrameIds.map((frameId) => {
    const rows = items.filter((item) => item.frameId === frameId);
    const texts = rows.flatMap((item) => item.text ?? []).map((frag) => frag.text ?? '');
    const signals = rows.flatMap((item) => item.visualSignals ?? []);
    const blob = `${texts.join(' ')} ${signals.join(' ')}`.toLowerCase();
    const textRich =
      rows.some((item) => item.type === 'TEXT_REGION' || item.type === 'BUTTON_LIKE_REGION' || item.type === 'FORM_REGION') ||
      texts.some((text) => text.trim().length >= 2);
    const addressBarVisible =
      rows.some((item) => item.type === 'BROWSER_CHROME') &&
      /address|url|localhost|tab|toolbar|browser/.test(blob);
    return { frameId, textRich, addressBarVisible };
  });
}

export function assertTextEvidenceFrameBudget(frameCount: number): void {
  if (frameCount < 1 || frameCount > TEXT_EVIDENCE_MAX_FRAMES) {
    throw new Error('TEXT_EVIDENCE_FRAME_LIMIT');
  }
}

export function assertB26ACallBModules(modules: readonly string[], frameCount: number): void {
  if (modules.includes('DEVELOPER_ARTIFACT')) {
    throw new Error('B26A_DEV_ARTIFACT_MODULE_FORBIDDEN');
  }
  if (modules.includes('TEXT_EVIDENCE') && modules.includes('UI_STRUCTURE')) {
    throw new Error('B26A_MODULE_SPLIT_REQUIRED');
  }
  if (!(modules.length === 1 && modules[0] === 'TEXT_EVIDENCE')) {
    throw new Error('B26A_CALL_B_TEXT_ONLY');
  }
  assertTextEvidenceFrameBudget(frameCount);
}

export function promptForcesProductUi(prompt: string): boolean {
  return /you must (output|emit) product_ui/i.test(prompt) || /must output product_ui/i.test(prompt);
}

export function assessB26ALatency(ms: number): 'GOOD' | 'ACCEPTABLE' | 'HIGH' | 'TOO_HIGH' {
  if (ms <= 60_000) return 'GOOD';
  if (ms <= 90_000) return 'ACCEPTABLE';
  if (ms <= 120_000) return 'HIGH';
  return 'TOO_HIGH';
}

export function classifyTextMatch(expected: string, observed: readonly string[]): 'EXACT' | 'NEAR' | 'WRONG' | 'MISSED' {
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = norm(expected);
  if (!target) return 'MISSED';
  const hay = observed.map(norm).filter(Boolean);
  if (hay.some((item) => item === target)) return 'EXACT';
  if (hay.some((item) => item.includes(target) || target.includes(item))) return 'NEAR';
  const tokens = target.split(' ').filter((token) => token.length >= 2);
  if (tokens.length > 0 && hay.some((item) => tokens.every((token) => item.includes(token)))) return 'NEAR';
  if (hay.length === 0) return 'MISSED';
  return 'MISSED';
}

export function detectSemanticInflation(input: {
  frameCount: number;
  productUiFrames: number;
  navigationCount: number;
  contentPanelCount: number;
  productUiSignals: string[][];
}): 'NONE' | 'OVER_CALIBRATED' {
  if (input.frameCount === 0 || input.productUiFrames !== input.frameCount) return 'NONE';
  if (input.navigationCount === 0 && input.contentPanelCount === 0) return 'OVER_CALIBRATED';
  const joined = input.productUiSignals.map((signals) => signals.join('|').toLowerCase());
  const unique = new Set(joined);
  if (unique.size === 1 && joined[0] !== undefined && joined[0].length < 24) return 'OVER_CALIBRATED';
  return 'NONE';
}

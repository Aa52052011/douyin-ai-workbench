import type { NormalizedRect } from '../visual/geometry/types.js';
import { SEMANTIC_COMPOSITION_INTEGRITY_VERSION, type IntegrityFailCode } from './constants.js';
import { CONTENT_01_CONTAINERS, contains, intersects, type SemanticContainerV1 } from './containers.js';

export type IntegrityResultV1 = {
  schemaVersion: typeof SEMANTIC_COMPOSITION_INTEGRITY_VERSION;
  ok: boolean;
  codes: IntegrityFailCode[];
  cutContainers: string[];
};

export function auditCropIntegrity(
  crop: NormalizedRect,
  containers: readonly SemanticContainerV1[] = CONTENT_01_CONTAINERS,
  opts?: { textIsEvidence?: boolean },
): IntegrityResultV1 {
  const textIsEvidence = opts?.textIsEvidence !== false;
  const codes: IntegrityFailCode[] = [];
  const cutContainers: string[] = [];
  for (const item of containers) {
    if (!intersects(crop, item.rect)) continue;
    if (contains(crop, item.rect)) continue;
    cutContainers.push(item.ref);
    if (item.type === 'TEXT_BLOCK' && textIsEvidence) {
      codes.push('TEXT_LINE_CUT');
      codes.push('TEXT_BLOCK_PARTIALLY_CUT');
      codes.push('IMPORTANT_LABEL_CUT');
    }
    if (item.type === 'NAVIGATION_PANEL') codes.push('NAV_ITEM_HALF_CUT');
    if (item.type === 'CARD') codes.push('CARD_PARTIALLY_CUT_WITHOUT_REASON');
    if (item.type === 'ACTION_GROUP') codes.push('BUTTON_PARTIALLY_VISIBLE');
    if (item.type === 'TABLE') codes.push('TABLE_COLUMN_BROKEN');
    if (item.type === 'SECTION' || item.type === 'HEADER') codes.push('SECTION_TITLE_MISSING');
    if (item.type === 'CONTENT_PANEL' || item.type === 'FORM' || item.type === 'PAGE') {
      codes.push('SEMANTIC_CONTAINER_FRAGMENTED');
    }
  }
  return {
    schemaVersion: SEMANTIC_COMPOSITION_INTEGRITY_VERSION,
    ok: codes.length === 0,
    codes: [...new Set(codes)],
    cutContainers,
  };
}

export function expandUntilIntegrity(
  crop: NormalizedRect,
  containers: readonly SemanticContainerV1[] = CONTENT_01_CONTAINERS,
): { crop: NormalizedRect; expanded: boolean; integrity: IntegrityResultV1 } {
  let next = crop;
  let expanded = false;
  for (const item of containers) {
    if (!intersects(next, item.rect) || contains(next, item.rect)) continue;
    const x = Math.min(next.x, item.rect.x);
    const y = Math.min(next.y, item.rect.y);
    const x2 = Math.max(next.x + next.width, item.rect.x + item.rect.width);
    const y2 = Math.max(next.y + next.height, item.rect.y + item.rect.height);
    next = { x, y, width: x2 - x, height: y2 - y };
    expanded = true;
  }
  return { crop: next, expanded, integrity: auditCropIntegrity(next, containers) };
}

import type { NormalizedRect } from '../visual/geometry/types.js';
import type { SemanticContainerTypeV1 } from './constants.js';

export type SemanticContainerV1 = {
  ref: string;
  type: SemanticContainerTypeV1;
  rect: NormalizedRect;
  textEvidence: boolean;
};

export const CONTENT_01_CONTAINERS: SemanticContainerV1[] = [
  { ref: 'container:PAGE', type: 'PAGE', rect: { x: 0.085, y: 0.106, width: 0.82, height: 0.894 }, textEvidence: false },
  { ref: 'container:HEADER', type: 'HEADER', rect: { x: 0.085, y: 0.106, width: 0.82, height: 0.12 }, textEvidence: true },
  { ref: 'container:NAVIGATION_PANEL', type: 'NAVIGATION_PANEL', rect: { x: 0.085, y: 0.106, width: 0.14, height: 0.72 }, textEvidence: true },
  { ref: 'container:CONTENT_PANEL', type: 'CONTENT_PANEL', rect: { x: 0.24, y: 0.28, width: 0.66, height: 0.7 }, textEvidence: true },
  { ref: 'container:TEXT_BLOCK', type: 'TEXT_BLOCK', rect: { x: 0.22, y: 0.12, width: 0.4, height: 0.06 }, textEvidence: true },
  { ref: 'container:SECTION', type: 'SECTION', rect: { x: 0.24, y: 0.28, width: 0.66, height: 0.7 }, textEvidence: true },
  { ref: 'container:CARD', type: 'CARD', rect: { x: 0.26, y: 0.32, width: 0.28, height: 0.22 }, textEvidence: true },
  { ref: 'container:ACTION_GROUP', type: 'ACTION_GROUP', rect: { x: 0.72, y: 0.12, width: 0.16, height: 0.07 }, textEvidence: true },
  { ref: 'container:STATUS_GROUP', type: 'STATUS_GROUP', rect: { x: 0.24, y: 0.12, width: 0.18, height: 0.06 }, textEvidence: true },
  { ref: 'container:FORM', type: 'FORM', rect: { x: 0.24, y: 0.4, width: 0.5, height: 0.4 }, textEvidence: true },
  { ref: 'container:TABLE', type: 'TABLE', rect: { x: 0.24, y: 0.5, width: 0.62, height: 0.42 }, textEvidence: true },
  { ref: 'container:MODAL', type: 'MODAL', rect: { x: 0.32, y: 0.22, width: 0.36, height: 0.5 }, textEvidence: true },
];

export function intersects(a: NormalizedRect, b: NormalizedRect, minOverlap = 0.02): boolean {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = Math.max(0, x2 - x);
  const h = Math.max(0, y2 - y);
  const overlap = w * h;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 && overlap / smaller >= minOverlap;
}

export function contains(outer: NormalizedRect, inner: NormalizedRect, slack = 0.012): boolean {
  return (
    outer.x <= inner.x + slack &&
    outer.y <= inner.y + slack &&
    outer.x + outer.width >= inner.x + inner.width - slack &&
    outer.y + outer.height >= inner.y + inner.height - slack
  );
}

export function expandToContainer(crop: NormalizedRect, container: NormalizedRect): NormalizedRect {
  const x = Math.min(crop.x, container.x);
  const y = Math.min(crop.y, container.y);
  const x2 = Math.max(crop.x + crop.width, container.x + container.width);
  const y2 = Math.max(crop.y + crop.height, container.y + container.height);
  return { x, y, width: x2 - x, height: y2 - y };
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import type { DynamicReframePlanV1 } from './types.js';

export function frozenDynamicPlanPath(): string {
  return path.join(
    repoRootFromHere(),
    '.local',
    'dogfood',
    '30-day',
    'first-3',
    'content-01',
    'production-2-visual-semantic',
    'b2-15a',
    'content01',
    'dynamic-segment-proposal.json',
  );
}

export function loadFrozenDynamicPlan(): DynamicReframePlanV1 {
  return JSON.parse(readFileSync(frozenDynamicPlanPath(), 'utf8')) as DynamicReframePlanV1;
}

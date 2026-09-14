import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import { validateEditorialPlan } from '../editorial-shot-director/validator.js';
import type { EditorialShotPlanV1 } from '../editorial-shot-director/types.js';

export function frozenEditorialPlanPath(): string {
  return path.join(
    repoRootFromHere(),
    '.local',
    'dogfood',
    '30-day',
    'first-3',
    'content-01',
    'production-2-visual-semantic',
    'b2-15c',
    'content01',
    'editorial-shot-plan.json',
  );
}

export function loadFrozenEditorialPlan(): EditorialShotPlanV1 {
  const file = frozenEditorialPlanPath();
  if (!existsSync(file)) throw new Error('FROZEN_EDITORIAL_PLAN_MISSING');
  const plan = JSON.parse(readFileSync(file, 'utf8')) as EditorialShotPlanV1;
  const valid = validateEditorialPlan(plan);
  if (!valid.ok) throw new Error(valid.code);
  return plan;
}

import { EDITORIAL_SHOT_POLICY } from './policy.js';
import type { EditorialShotPlanV1, EditorialShotV1 } from './types.js';

export function consecutiveDetailRuns(shots: readonly EditorialShotV1[]): Array<{ count: number; durationMs: number }> {
  const runs: Array<{ count: number; durationMs: number }> = [];
  let count = 0;
  let duration = 0;
  const flush = () => {
    if (count > 0) runs.push({ count, durationMs: duration });
    count = 0;
    duration = 0;
  };
  for (const shot of shots) {
    if (shot.shotScale === 'DETAIL_READABLE') {
      count += 1;
      duration += shot.sourceEndMs - shot.sourceStartMs;
    } else {
      flush();
    }
  }
  flush();
  return runs;
}

export function validateEditorialPlan(plan: EditorialShotPlanV1): { ok: true } | { ok: false; code: string } {
  if (plan.schemaVersion !== 'editorial.shot-plan:v1') return { ok: false, code: 'PLAN_VERSION_MISMATCH' };
  if (plan.shots.length === 0) return { ok: false, code: 'EMPTY_PLAN' };
  if (plan.shots.length < EDITORIAL_SHOT_POLICY.suggestedShotCount.min) return { ok: false, code: 'TOO_FEW_SHOTS' };
  if (plan.shots.length > EDITORIAL_SHOT_POLICY.suggestedShotCount.max) return { ok: false, code: 'SHOT_FRAGMENTATION_WARNING' };
  let cursor = plan.coverage.startMs;
  let mediumMs = 0;
  let detailMs = 0;
  let total = 0;
  for (const shot of plan.shots) {
    if (!(shot.sourceStartMs < shot.sourceEndMs)) return { ok: false, code: 'INVALID_TIME_RANGE' };
    if (shot.sourceStartMs < cursor - 1) return { ok: false, code: 'ILLEGAL_OVERLAP' };
    if (!shot.narrationUnitRefs.length || !shot.claimRefs.length) return { ok: false, code: 'NARRATION_UNALIGNED' };
    if (shot.claimRefs.includes('C5') || shot.claimRefs.includes('C6')) return { ok: false, code: 'C5_C6_CLAIM_BOOST' };
    if (!shot.shotPurpose) return { ok: false, code: 'MISSING_SHOT_PURPOSE' };
    const dur = shot.sourceEndMs - shot.sourceStartMs;
    total += dur;
    if (shot.shotScale === 'MEDIUM_FOCUS') mediumMs += dur;
    if (shot.shotScale === 'DETAIL_READABLE') detailMs += dur;
    cursor = shot.sourceEndMs;
  }
  if (plan.shots.every((item) => item.shotScale === 'DETAIL_READABLE')) return { ok: false, code: 'DETAIL_OVERUSE' };
  if (detailMs > total * 0.45) return { ok: false, code: 'DETAIL_OVERUSE' };
  const runs = consecutiveDetailRuns(plan.shots);
  if (runs.some((run) => run.count > EDITORIAL_SHOT_POLICY.maxConsecutiveDetailShots || run.durationMs > EDITORIAL_SHOT_POLICY.maxContinuousDetailDurationMs)) {
    return { ok: false, code: 'CONTEXT_RECOVERY_REQUIRED' };
  }
  if (mediumMs < total * 0.4) return { ok: false, code: 'MEDIUM_NOT_DOMINANT' };
  const avg = total / plan.shots.length;
  if (avg < EDITORIAL_SHOT_POLICY.antiChoppinessAvgMinMs) return { ok: false, code: 'SHOT_FRAGMENTATION_WARNING' };
  if (Math.abs(cursor - plan.coverage.endMs) > 2) return { ok: false, code: 'COVERAGE_MISMATCH' };
  return { ok: true };
}

export function requiresContextRecovery(shots: readonly EditorialShotV1[]): boolean {
  return consecutiveDetailRuns(shots).some(
    (run) => run.count > EDITORIAL_SHOT_POLICY.maxConsecutiveDetailShots || run.durationMs > EDITORIAL_SHOT_POLICY.maxContinuousDetailDurationMs,
  );
}

import { MAX_QUALITY_REPAIR_ATTEMPTS } from './quality.types.js';
import { applyAttemptDisposition, qualityGateErrorResult } from './quality-check.js';
import { issueFingerprint } from './quality-hash.js';
import { planQualityRepairs } from './quality-repair-planner.js';
import type {
  ProductionQualityResult,
  QualityCheckpoint,
  QualityDisposition,
  RepairPlan,
} from './quality.types.js';

export type QualityLoopDeps = {
  check: (attempt: number) => ProductionQualityResult;
  plan: typeof planQualityRepairs;
  execute: (plan: RepairPlan) => { providerCalls: number; afterHash: string };
};

export function runQualityRepairLoop(
  deps: QualityLoopDeps,
  existing?: QualityCheckpoint,
): { checkpoint: QualityCheckpoint; result: ProductionQualityResult } {
  const qualityChecks = [...(existing?.qualityChecks ?? [])];
  const repairHistory = [...(existing?.repairHistory ?? [])];
  let last = qualityChecks.at(-1);
  const hash = existing?.qualityInputHash ?? last?.qualityInputHash ?? '';
  if (last && last.qualityInputHash === hash && last.status === 'PASS' && last.attempt === 0) {
    return {
      checkpoint: {
        rulesetVersion: 'v1',
        qualityInputHash: hash,
        latestQualityResult: last,
        qualityChecks,
        repairHistory,
        qualityDisposition: 'PASS',
      },
      result: last,
    };
  }

  try {
    let attempt = 0;
    let result = deps.check(0);
    qualityChecks.push(result);
    let providerUsed = 0;
    while (result.status !== 'PASS' && attempt < MAX_QUALITY_REPAIR_ATTEMPTS) {
      const previous = repairHistory.at(-1);
      const plan = deps.plan({
        result,
        attempt: attempt + 1,
        previousFingerprints: previous?.issueFingerprints,
        previousActions: previous?.actions,
        providerActionsUsed: providerUsed,
      });
      if (plan.actions.length === 0) {
        result = applyAttemptDisposition(result, {
          attemptsUsed: attempt + 1,
          maxAttempts: MAX_QUALITY_REPAIR_ATTEMPTS,
          remainingRepairable: false,
        });
        break;
      }
      const started = Date.now();
      const fingerprints = result.issues.map(issueFingerprint);
      const executed = deps.execute(plan);
      providerUsed += executed.providerCalls;
      repairHistory.push({
        attempt: attempt + 1,
        issueFingerprints: fingerprints,
        actions: plan.actions.map((item) => item.type),
        beforeHash: result.qualityInputHash,
        afterHash: executed.afterHash,
        result: 'EXECUTED',
        providerCalls: executed.providerCalls,
        durationMs: Date.now() - started,
      });
      attempt += 1;
      result = deps.check(attempt);
      qualityChecks.push(result);
    }
    if (result.status !== 'PASS') {
      result = applyAttemptDisposition(result, {
        attemptsUsed: attempt,
        maxAttempts: MAX_QUALITY_REPAIR_ATTEMPTS,
        remainingRepairable: result.repairableIssueCount > 0 && attempt < MAX_QUALITY_REPAIR_ATTEMPTS,
      });
    }
    const disposition: QualityDisposition = result.finalDisposition;
    return {
      checkpoint: {
        rulesetVersion: 'v1',
        qualityInputHash: result.qualityInputHash,
        latestQualityResult: result,
        qualityChecks,
        repairHistory,
        qualityDisposition: disposition,
      },
      result,
    };
  } catch {
    const failed = qualityGateErrorResult(hash, 0);
    return {
      checkpoint: {
        rulesetVersion: 'v1',
        qualityInputHash: hash,
        latestQualityResult: failed,
        qualityChecks: [...qualityChecks, failed],
        repairHistory,
        qualityDisposition: 'BLOCKED',
      },
      result: failed,
    };
  }
}

export function emptyQualityCheckpoint(hash: string): QualityCheckpoint {
  return {
    rulesetVersion: 'v1',
    qualityInputHash: hash,
    qualityChecks: [],
    repairHistory: [],
  };
}

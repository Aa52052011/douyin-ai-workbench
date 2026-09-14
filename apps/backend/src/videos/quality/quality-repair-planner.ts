import { issueFingerprint } from './quality-hash.js';
import {
  HARD_BLOCK_CODES,
  MAX_PROVIDER_REPAIR_ACTIONS,
  type ProductionQualityResult,
  type RepairAction,
  type RepairActionType,
  type RepairPlan,
  type RepairScope,
} from './quality.types.js';

const PRIORITY: RepairActionType[] = [
  'REBUILD_TIMELINE',
  'REBUILD_SUBTITLE',
  'REPLACE_SHOT_ASSET',
  'REGENERATE_AI_IMAGE',
  'REGENERATE_VOICE',
  'ADJUST_SHOT_DURATION',
  'ADJUST_AUDIO_MODE',
  'RECOMPOSE',
  'MARK_BEST_AVAILABLE',
];

export function planQualityRepairs(input: {
  result: ProductionQualityResult;
  attempt: number;
  previousFingerprints?: string[];
  previousActions?: RepairActionType[];
  providerActionsUsed?: number;
}): RepairPlan {
  const fingerprints = input.result.issues.map(issueFingerprint);
  const sameError =
    input.previousFingerprints?.length &&
    fingerprints.length === input.previousFingerprints.length &&
    fingerprints.every((item) => input.previousFingerprints!.includes(item));
  const actions: RepairAction[] = [];
  if (sameError) {
    return {
      attempt: input.attempt,
      actions: [],
      estimatedScope: 'GLOBAL',
      requiresProvider: false,
      requiresRecompose: false,
      expectedIssueCodes: input.result.issues.map((item) => item.code),
      fallbackIfFailed: input.result.issues.some((item) => HARD_BLOCK_CODES.includes(item.code)) ? 'BLOCKED' : 'BEST_AVAILABLE',
    };
  }

  let providerBudget = Math.max(0, MAX_PROVIDER_REPAIR_ACTIONS - (input.providerActionsUsed ?? 0));
  for (const type of PRIORITY) {
    for (const issue of input.result.issues) {
      if (!issue.repairable || issue.suggestedRepairType !== type) {
        continue;
      }
      const requiresProvider = type === 'REGENERATE_VOICE' || type === 'REGENERATE_AI_IMAGE';
      if (requiresProvider && providerBudget <= 0) {
        continue;
      }
      if (requiresProvider) {
        providerBudget -= 1;
      }
      if (actions.some((item) => item.type === type && item.shotSequence === issue.shotSequence && item.assetId === issue.assetId)) {
        continue;
      }
      actions.push({
        type,
        scope: issue.scope,
        shotSequence: issue.shotSequence,
        assetId: issue.assetId,
        issueCodes: [issue.code],
        requiresProvider,
      });
    }
  }

  const needsCompose =
    actions.some((item) =>
      ['REBUILD_TIMELINE', 'REPLACE_SHOT_ASSET', 'REGENERATE_AI_IMAGE', 'REBUILD_SUBTITLE', 'REGENERATE_VOICE', 'ADJUST_SHOT_DURATION', 'RECOMPOSE'].includes(
        item.type,
      ),
    ) || input.result.issues.some((item) => item.code === 'MEDIA_CORRUPTED' || item.code === 'OUTPUT_MISSING');
  if (needsCompose && !actions.some((item) => item.type === 'RECOMPOSE')) {
    actions.push({
      type: 'RECOMPOSE',
      scope: 'COMPOSE',
      issueCodes: input.result.issues.filter((item) => item.scope === 'COMPOSE').map((item) => item.code),
      requiresProvider: false,
    });
  }

  const scopes = new Set(actions.map((item) => item.scope));
  const estimatedScope: RepairScope = scopes.size === 1 ? [...scopes][0]! : scopes.has('GLOBAL') ? 'GLOBAL' : 'TIMELINE';
  const hard = input.result.issues.some((item) => HARD_BLOCK_CODES.includes(item.code));
  return {
    attempt: input.attempt,
    actions,
    estimatedScope,
    requiresProvider: actions.some((item) => item.requiresProvider),
    requiresRecompose: actions.some((item) => item.type === 'RECOMPOSE'),
    expectedIssueCodes: input.result.issues.map((item) => item.code),
    fallbackIfFailed: hard ? 'BLOCKED' : 'BEST_AVAILABLE',
  };
}

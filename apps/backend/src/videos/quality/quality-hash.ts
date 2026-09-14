import { createHash } from 'node:crypto';
import { QUALITY_RULESET_VERSION } from './quality.types.js';

export function hashQualityInput(input: {
  composeAssetId?: string;
  timelineHash?: string;
  voiceAssetId?: string;
  subtitleAssetId?: string;
  rulesetVersion?: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        composeAssetId: input.composeAssetId ?? '',
        timelineHash: input.timelineHash ?? '',
        voiceAssetId: input.voiceAssetId ?? '',
        subtitleAssetId: input.subtitleAssetId ?? '',
        rulesetVersion: input.rulesetVersion ?? QUALITY_RULESET_VERSION,
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

export function issueFingerprint(issue: {
  code: string;
  scope: string;
  shotSequence?: number;
  assetId?: string;
}): string {
  return `${issue.code}|${issue.scope}|${issue.shotSequence ?? ''}|${issue.assetId ?? ''}`;
}

export function repairFingerprint(input: { issueFingerprints: string[]; actions: string[] }): string {
  return createHash('sha256')
    .update(JSON.stringify({ issues: [...input.issueFingerprints].sort(), actions: input.actions }))
    .digest('hex')
    .slice(0, 16);
}

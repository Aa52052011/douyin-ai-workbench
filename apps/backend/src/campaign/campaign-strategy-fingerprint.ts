import { createHash } from 'node:crypto';
import type { CampaignStrategyInputSnapshot } from './campaign-strategy.types.js';

export function campaignStrategySemanticFingerprint(snapshot: CampaignStrategyInputSnapshot): string {
  const performance = snapshot.performanceFeedback;
  const payload = {
    productBriefId: snapshot.productBrief.id,
    productBriefVersion: snapshot.productBrief.version,
    marketInsightId: snapshot.marketInsight?.id ?? null,
    marketInsightVersion: snapshot.marketInsight?.version ?? null,
    positioningRunId: snapshot.accountPositioning.positioningRunId,
    performance: {
      dataState: performance.dataState,
      sampleSize: performance.sampleSize,
      publicationsConsidered: performance.publicationsConsidered,
      dataQuality: {
        sufficientCount: performance.dataQuality.sufficientCount,
        partialCount: performance.dataQuality.partialCount,
        insufficientCount: performance.dataQuality.insufficientCount,
      },
      positiveSignals: [...performance.positiveSignals.map((item) => item.code)].sort(),
      cautionSignals: [...performance.cautionSignals.map((item) => item.code)].sort(),
      dataQualitySignals: [...performance.dataQualitySignals.map((item) => item.code)].sort(),
      inconsistentPerformance: Boolean(performance.inconsistentPerformance),
    },
    currentUserGoal: {
      userGoal: snapshot.currentUserGoal?.userGoal ?? null,
      focus: snapshot.currentUserGoal?.focus ?? null,
      constraints: snapshot.currentUserGoal?.constraints ?? null,
    },
    confidenceCeiling: snapshot.confidenceCeiling,
    flags: [...snapshot.flags].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

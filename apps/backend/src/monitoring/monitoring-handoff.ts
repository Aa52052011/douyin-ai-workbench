export type MonitoringTargetV1 = {
  schemaVersion: 'monitoring.target:v1';
  publishedPostId: string;
  platform: 'DOUYIN';
  platformPostId: string | null;
  platformUrl: string | null;
  artifactId: string;
  scriptId: string | null;
  contentPlanId: string | null;
  registeredAt: string;
  monitoringMode: 'MANUAL_IMPORT' | 'OFFICIAL_API' | 'HYBRID';
};

export function buildMonitoringHandoffV1(input: {
  publishedPostId: string;
  platformPostId?: string | null;
  platformUrl?: string | null;
  artifactId: string;
  scriptId?: string | null;
  contentPlanId?: string | null;
  registeredAt: Date;
  monitoringMode?: MonitoringTargetV1['monitoringMode'];
}): MonitoringTargetV1 {
  return {
    schemaVersion: 'monitoring.target:v1',
    publishedPostId: input.publishedPostId,
    platform: 'DOUYIN',
    platformPostId: input.platformPostId ?? null,
    platformUrl: input.platformUrl ?? null,
    artifactId: input.artifactId,
    scriptId: input.scriptId ?? null,
    contentPlanId: input.contentPlanId ?? null,
    registeredAt: input.registeredAt.toISOString(),
    monitoringMode: input.monitoringMode ?? 'MANUAL_IMPORT',
  };
}

export type PerformanceAnalysisInputV1 = {
  schemaVersion: 'performance.analysis-input:v1';
  publishedPost: { id: string; platform: string; platformPostId: string | null; platformUrl: string | null };
  contentPlan: unknown | null;
  script: unknown | null;
  artifactMetadata: { artifactId: string; sha256?: string | null };
  metricsSnapshots: unknown[];
  accountPositioning: unknown | null;
  timeWindow: { from: string | null; to: string | null };
  feedbackCycleId: string | null;
  llmInvoked: false;
};

export function buildPerformanceAnalysisInputV1(input: {
  publishedPostId: string;
  platformPostId?: string | null;
  platformUrl?: string | null;
  artifactId: string;
  artifactSha?: string | null;
  contentPlan?: unknown | null;
  script?: unknown | null;
  metricsSnapshots?: unknown[];
  accountPositioning?: unknown | null;
  timeWindow?: { from: string | null; to: string | null };
  feedbackCycleId?: string | null;
}): PerformanceAnalysisInputV1 {
  return {
    schemaVersion: 'performance.analysis-input:v1',
    publishedPost: {
      id: input.publishedPostId,
      platform: 'DOUYIN',
      platformPostId: input.platformPostId ?? null,
      platformUrl: input.platformUrl ?? null,
    },
    contentPlan: input.contentPlan ?? null,
    script: input.script ?? null,
    artifactMetadata: { artifactId: input.artifactId, sha256: input.artifactSha ?? null },
    metricsSnapshots: input.metricsSnapshots ?? [],
    accountPositioning: input.accountPositioning ?? null,
    timeWindow: input.timeWindow ?? { from: null, to: null },
    feedbackCycleId: input.feedbackCycleId ?? null,
    llmInvoked: false,
  };
}

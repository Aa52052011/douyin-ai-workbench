import {
  PERFORMANCE_ANALYSIS_AGENT_ID,
  PERFORMANCE_ANALYSIS_AGENT_VERSION,
  PERFORMANCE_ANALYSIS_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';

export const performanceAnalysisDefinition: AgentDefinition = {
  id: PERFORMANCE_ANALYSIS_AGENT_ID,
  name: '发布后表现复盘',
  version: PERFORMANCE_ANALYSIS_AGENT_VERSION,
  description:
    '基于用户录入的 MetricsSnapshot 做证据优先复盘。不是爆款预测、不是收益预测、不是算法破解。V1 走确定性计算器 + mock；无指标不得调用 LLM。',
  capabilities: [
    'performance-analysis',
    'evidence-first',
    'no-viral-prediction',
    'human-review-required',
    'no-auto-plan-mutation',
  ],
  timeoutMs: PERFORMANCE_ANALYSIS_TIMEOUT_MS,
  temperature: 0.1,
  maxTokens: 2000,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['tenantId', 'workspaceId', 'projectId', 'publishedPostId', 'metricsSnapshots', 'contentPlanSnapshot', 'scriptSnapshot'],
    properties: {
      tenantId: { type: 'string' },
      workspaceId: { type: 'string' },
      projectId: { type: 'string' },
      publishedPostId: { type: 'string' },
      accountPositioningSnapshot: { type: 'object' },
      contentPlanSnapshot: { type: 'object' },
      scriptSnapshot: { type: 'object' },
      artifactSnapshot: { type: 'object' },
      publicationSnapshot: { type: 'object' },
      metricsSnapshots: { type: 'array' },
      analysisWindow: { type: 'string' },
      previousComparablePosts: { type: 'array' },
      feedbackCycleId: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'metricsSummary', 'findings', 'recommendations', 'benchmarkContext', 'dataSufficiency'],
    properties: {
      version: { type: 'string' },
      metricsSummary: { type: 'object' },
      findings: { type: 'array' },
      recommendations: { type: 'array' },
      benchmarkContext: { type: 'string' },
      dataSufficiency: { type: 'string' },
      confidenceSummary: { type: 'object' },
      llmInvoked: { type: 'boolean' },
    },
  },
};

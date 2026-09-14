import {
  PERFORMANCE_LEARNING_AGENT_ID,
  PERFORMANCE_LEARNING_AGENT_VERSION,
  PERFORMANCE_LEARNING_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';

export const performanceLearningDefinition: AgentDefinition = {
  id: PERFORMANCE_LEARNING_AGENT_ID,
  name: '表现学习建议',
  version: PERFORMANCE_LEARNING_AGENT_VERSION,
  description: '把已聚合的 confirmed/candidate signals 转成自然语言建议。确定性聚合是权威；无信号时不得编造建议。',
  capabilities: ['performance-learning', 'recommendation-copy', 'no-strategy-mutation'],
  timeoutMs: PERFORMANCE_LEARNING_TIMEOUT_MS,
  temperature: 0.2,
  maxTokens: 1500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      businessGoal: { type: 'string' },
      currentStrategySummary: { type: 'string' },
      confirmedSignals: { type: 'array' },
      candidateSignals: { type: 'array' },
      recentBatchSummary: { type: 'object' },
      metricAvailability: { type: 'object' },
      dataQuality: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'status', 'recommendations', 'risks', 'continueDoing', 'reduceDoing', 'testNext'],
    properties: {
      version: { type: 'string' },
      status: { type: 'string' },
      recommendations: { type: 'array' },
      risks: { type: 'array' },
      continueDoing: { type: 'array' },
      reduceDoing: { type: 'array' },
      testNext: { type: 'array' },
    },
  },
};

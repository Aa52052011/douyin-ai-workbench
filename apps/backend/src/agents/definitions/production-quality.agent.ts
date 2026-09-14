import {
  PRODUCTION_QUALITY_AGENT_ID,
  PRODUCTION_QUALITY_AGENT_VERSION,
  PRODUCTION_QUALITY_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';

export const productionQualityDefinition: AgentDefinition = {
  id: PRODUCTION_QUALITY_AGENT_ID,
  name: '制作质量语义辅助',
  version: PRODUCTION_QUALITY_AGENT_VERSION,
  description: '未来语义质检层。V1 仅注册契约，确定性 Quality Gate 仍是权威，不得假装看过成片。',
  capabilities: ['production-quality', 'metadata-only', 'not-vision'],
  timeoutMs: PRODUCTION_QUALITY_TIMEOUT_MS,
  temperature: 0.1,
  maxTokens: 1200,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scriptSummary: { type: 'string' },
      directorSummary: { type: 'string' },
      timelineSummary: { type: 'string' },
      deterministicChecks: { type: 'object' },
      assetDescriptions: { type: 'array' },
      transcript: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'semanticIssues', 'disclaimer'],
    properties: {
      version: { type: 'string' },
      semanticIssues: { type: 'array' },
      openingAssessment: { type: 'string' },
      alignmentConcerns: { type: 'array' },
      pacingConcerns: { type: 'array' },
      ctaConcerns: { type: 'array' },
      disclaimer: { type: 'string' },
    },
  },
};

export type JsonObject = Record<string, unknown>;

export type AgentDefinition = {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  timeoutMs: number;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AgentContext = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  requestId: string;
  locale: string;
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
};

export type InternalAgentRequest = {
  requestId: string;
  agentId: string;
  agentVersion: string;
  context: AgentContext;
  input: unknown;
};

export type InternalAgentError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type InternalAgentResponse = {
  status: 'COMPLETED' | 'FAILED';
  output?: JsonObject;
  usage?: TokenUsage;
  error?: InternalAgentError;
};

export type AgentRunPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentVersion: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  requestId: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCost: string | null;
  };
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  durationMs: number | null;
};

export const DEFAULT_AGENT_TIMEOUT_MS = 60_000;
/** Floor for production LLM agents. Never lower an already-higher agent timeout. */
export const MIN_PRODUCTION_LLM_TIMEOUT_MS = 210_000;

export function productionLlmTimeoutMs(configuredMs: number): number {
  if (!Number.isFinite(configuredMs) || configuredMs <= 0) {
    return MIN_PRODUCTION_LLM_TIMEOUT_MS;
  }
  return Math.max(configuredMs, MIN_PRODUCTION_LLM_TIMEOUT_MS);
}

export const ECHO_AGENT_ID = 'system.echo';
export const ECHO_AGENT_VERSION = 'v1';

export const ACCOUNT_POSITIONING_AGENT_ID = 'account.positioning';
export const ACCOUNT_POSITIONING_AGENT_VERSION = 'v1';
export const ACCOUNT_POSITIONING_PROMPT = 'account.positioning';

export const CONTENT_PLANNING_AGENT_ID = 'content.planning';
export const CONTENT_PLANNING_AGENT_VERSION = 'v1';
export const CONTENT_PLANNING_PROMPT = 'content.planning';
export const CONTENT_PLANNING_TIMEOUT_MS = 90_000;
export const CONTENT_PLAN_V1_DAYS = 7;
export const CONTENT_PLAN_MAX_POSTS_PER_DAY = 5;

export const SCRIPT_GENERATION_AGENT_ID = 'script.generation';
export const SCRIPT_GENERATION_AGENT_VERSION = 'v1';
export const SCRIPT_GENERATION_PROMPT = 'script.generation';
export const SCRIPT_GENERATION_TIMEOUT_MS = 60_000;
export const SCRIPT_TARGET_DURATIONS = [15, 30, 45, 60] as const;

export const MARKET_INTELLIGENCE_AGENT_ID = 'market.intelligence';
export const MARKET_INTELLIGENCE_AGENT_VERSION = 'v1';
export const MARKET_INTELLIGENCE_PROMPT = 'market.intelligence';
export const MARKET_INTELLIGENCE_TIMEOUT_MS = 60_000;

export const CAMPAIGN_STRATEGY_AGENT_ID = 'campaign.strategy';
export const CAMPAIGN_STRATEGY_AGENT_VERSION = 'v1';
export const CAMPAIGN_STRATEGY_PROMPT = 'campaign.strategy';
export const CAMPAIGN_STRATEGY_TIMEOUT_MS = 120_000;

export const PRODUCT_INTAKE_AGENT_ID = 'product.intake';
export const PRODUCT_INTAKE_AGENT_VERSION = 'v1';
export const PRODUCT_INTAKE_PROMPT = 'product.intake';
export const PRODUCT_INTAKE_TIMEOUT_MS = 60_000;

export const MARKET_INTAKE_AGENT_ID = 'market.intake';
export const MARKET_INTAKE_AGENT_VERSION = 'v1';
export const MARKET_INTAKE_PROMPT = 'market.intake';
export const MARKET_INTAKE_TIMEOUT_MS = 60_000;

export const REFERENCE_ANALYSIS_AGENT_ID = 'reference.analysis';
export const REFERENCE_ANALYSIS_AGENT_VERSION = 'v1';
export const REFERENCE_ANALYSIS_PROMPT = 'reference.analysis';
export const REFERENCE_ANALYSIS_TIMEOUT_MS = 60_000;

export const PRODUCTION_QUALITY_AGENT_ID = 'production.quality';
export const PRODUCTION_QUALITY_AGENT_VERSION = 'v1';
export const PRODUCTION_QUALITY_PROMPT = 'production.quality';
export const PRODUCTION_QUALITY_TIMEOUT_MS = 30_000;

export const MARKET_RESEARCH_PLAN_AGENT_ID = 'market.research.plan';
export const MARKET_RESEARCH_PLAN_AGENT_VERSION = 'v1';
export const MARKET_RESEARCH_PLAN_TIMEOUT_MS = 30_000;

export const PERFORMANCE_LEARNING_AGENT_ID = 'performance.learning';
export const PERFORMANCE_LEARNING_AGENT_VERSION = 'v1';
export const PERFORMANCE_LEARNING_TIMEOUT_MS = 30_000;

export const PERFORMANCE_ANALYSIS_AGENT_ID = 'performance.analysis';
export const PERFORMANCE_ANALYSIS_AGENT_VERSION = 'v1';
export const PERFORMANCE_ANALYSIS_PROMPT = 'performance.analysis';
export const PERFORMANCE_ANALYSIS_TIMEOUT_MS = 30_000;

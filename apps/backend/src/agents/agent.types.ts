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

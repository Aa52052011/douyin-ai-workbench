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
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
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

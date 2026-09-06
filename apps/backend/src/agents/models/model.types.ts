import type { TokenUsage } from '../agent.types.js';

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelGenerateRequest = {
  prompt: string;
  systemPrompt?: string;
  messages?: ModelMessage[];
  model?: string;
  responseFormat?: 'text' | 'json';
  temperature?: number;
  maxTokens?: number;
  /** Optional per-call HTTP abort budget; defaults to DEFAULT_AGENT_TIMEOUT_MS. */
  timeoutMs?: number;
  agentId?: string;
  tenantId?: string;
  task?: string;
  provider?: string;
};

export type ModelGenerateResult = {
  text: string;
  provider: string;
  usage: TokenUsage;
};

export interface ModelProvider {
  readonly id: string;
  generate(request: ModelGenerateRequest): Promise<ModelGenerateResult>;
}

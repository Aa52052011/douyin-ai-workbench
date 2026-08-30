import type { TokenUsage } from '../agent.types.js';

export type ModelGenerateRequest = {
  prompt: string;
  systemPrompt?: string;
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

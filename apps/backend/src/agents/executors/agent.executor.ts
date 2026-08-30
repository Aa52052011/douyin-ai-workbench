import type { InternalAgentRequest, InternalAgentResponse } from '../agent.types.js';

export const AGENT_EXECUTOR = Symbol('AGENT_EXECUTOR');

export interface AgentExecutor {
  execute(request: InternalAgentRequest, timeoutMs: number): Promise<InternalAgentResponse>;
}

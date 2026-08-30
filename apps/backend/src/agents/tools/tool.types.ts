import type { AgentContext } from '../agent.types.js';

export type AgentTool = {
  name: string;
  description: string;
  execute(input: unknown, context: AgentContext): Promise<unknown>;
};

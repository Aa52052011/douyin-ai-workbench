import {
  DEFAULT_AGENT_TIMEOUT_MS,
  ECHO_AGENT_ID,
  ECHO_AGENT_VERSION,
  type AgentDefinition,
} from '../agent.types.js';

export const systemEchoDefinition: AgentDefinition = {
  id: ECHO_AGENT_ID,
  name: 'System Echo',
  version: ECHO_AGENT_VERSION,
  description: 'Test agent that echoes input. Verifies the Agent Engine pipeline.',
  capabilities: ['echo'],
  timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['message', 'agent', 'version'],
    properties: {
      message: { type: 'string' },
      agent: { type: 'string' },
      version: { type: 'string' },
    },
  },
};

export function parseEchoInput(input: unknown): { message: string } | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Object.keys(input);
  if (keys.some((key) => key !== 'message')) {
    return null;
  }
  const message = (input as { message?: unknown }).message;
  if (typeof message !== 'string') {
    return null;
  }
  const trimmed = message.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return null;
  }
  return { message: trimmed };
}

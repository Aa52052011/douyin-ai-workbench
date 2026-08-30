import { describe, expect, it } from 'vitest';
import { AgentError } from './agent.errors.js';
import { AgentRegistry } from './agent.registry.js';
import { ECHO_AGENT_ID, ECHO_AGENT_VERSION } from './agent.types.js';

describe('AgentRegistry', () => {
  it('registers and discovers system.echo', () => {
    const registry = new AgentRegistry();
    const listed = registry.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(ECHO_AGENT_ID);
    expect(listed[0]?.version).toBe(ECHO_AGENT_VERSION);
    expect(registry.get(ECHO_AGENT_ID).version).toBe(ECHO_AGENT_VERSION);
    expect(registry.get(ECHO_AGENT_ID, ECHO_AGENT_VERSION).id).toBe(ECHO_AGENT_ID);
  });

  it('rejects unknown agents and versions', () => {
    const registry = new AgentRegistry();
    expect(() => registry.get('account-positioning')).toThrow(AgentError);
    expect(() => registry.get(ECHO_AGENT_ID, 'v9')).toThrow(AgentError);
  });
});

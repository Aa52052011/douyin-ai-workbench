import { describe, expect, it } from 'vitest';
import { AgentError } from './agent.errors.js';
import { AgentRegistry } from './agent.registry.js';
import { ECHO_AGENT_ID, ECHO_AGENT_VERSION } from './agent.types.js';

describe('AgentRegistry', () => {
  it('registers and discovers system.echo', () => {
    const registry = new AgentRegistry();
    const listed = registry.list();
    expect(listed.map((item) => item.id).sort()).toEqual([
      'account.positioning',
      'campaign.strategy',
      'content.planning',
      'market.intelligence',
      'script.generation',
      'system.echo',
    ]);
    expect(registry.get(ECHO_AGENT_ID).version).toBe(ECHO_AGENT_VERSION);
    expect(registry.get(ECHO_AGENT_ID, ECHO_AGENT_VERSION).id).toBe(ECHO_AGENT_ID);
    expect(registry.get('account.positioning', 'v1').id).toBe('account.positioning');
    expect(registry.get('content.planning', 'v1').id).toBe('content.planning');
    expect(registry.get('script.generation', 'v1').id).toBe('script.generation');
    expect(registry.get('market.intelligence', 'v1').id).toBe('market.intelligence');
    expect(registry.get('campaign.strategy', 'v1').id).toBe('campaign.strategy');
  });

  it('rejects unknown agents and versions', () => {
    const registry = new AgentRegistry();
    expect(() => registry.get('account-positioning')).toThrow(AgentError);
    expect(() => registry.get(ECHO_AGENT_ID, 'v9')).toThrow(AgentError);
  });
});

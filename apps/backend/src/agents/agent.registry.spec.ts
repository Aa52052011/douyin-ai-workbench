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
      'market.intake',
      'market.intelligence',
      'market.research.plan',
      'performance.analysis',
      'performance.learning',
      'product.intake',
      'production.quality',
      'reference.analysis',
      'script.generation',
      'system.echo',
    ]);
    expect(registry.get('production.quality', 'v1').id).toBe('production.quality');
    expect(registry.get('reference.analysis', 'v1').id).toBe('reference.analysis');
    expect(registry.get(ECHO_AGENT_ID).version).toBe(ECHO_AGENT_VERSION);
    expect(registry.get(ECHO_AGENT_ID, ECHO_AGENT_VERSION).id).toBe(ECHO_AGENT_ID);
    expect(registry.get('account.positioning', 'v1').id).toBe('account.positioning');
    expect(registry.get('content.planning', 'v1').id).toBe('content.planning');
    expect(registry.get('script.generation', 'v1').id).toBe('script.generation');
    expect(registry.get('market.intelligence', 'v1').id).toBe('market.intelligence');
    expect(registry.get('campaign.strategy', 'v1').id).toBe('campaign.strategy');
    expect(registry.get('product.intake', 'v1').id).toBe('product.intake');
    expect(registry.get('market.intake', 'v1').id).toBe('market.intake');
    expect(registry.get('performance.analysis', 'v1').id).toBe('performance.analysis');
  });

  it('rejects unknown agents and versions', () => {
    const registry = new AgentRegistry();
    expect(() => registry.get('account-positioning')).toThrow(AgentError);
    expect(() => registry.get(ECHO_AGENT_ID, 'v9')).toThrow(AgentError);
  });
});

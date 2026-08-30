import { describe, expect, it } from 'vitest';
import { MockModelProvider } from './mock.provider.js';
import { ModelRouter } from './model.router.js';

describe('ModelRouter', () => {
  it('routes generate() through MockModelProvider without a real LLM', async () => {
    const router = new ModelRouter(new MockModelProvider());
    const result = await router.generate({
      prompt: 'hello',
      systemPrompt: 'echo',
      agentId: 'system.echo',
      tenantId: 'tenant',
      task: 'echo',
    });
    expect(result.provider).toBe('mock');
    expect(result.text).toBe('hello');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCost).toBe(0);
  });
});

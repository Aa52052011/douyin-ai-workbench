import { describe, expect, it } from 'vitest';
import { PromptRegistry } from './prompt.registry.js';

describe('PromptRegistry', () => {
  it('loads a versioned prompt and renders variables', () => {
    const registry = new PromptRegistry();
    const rendered = registry.render('system.echo', 'v1', { message: 'hello' });
    expect(rendered.name).toBe('system.echo');
    expect(rendered.version).toBe('v1');
    expect(rendered.userPrompt).toBe('hello');
    expect(rendered.systemPrompt).toContain('system.echo');
  });
});

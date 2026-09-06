import { describe, expect, it } from 'vitest';
import { isRealModelConfigured } from './model.config.js';
import { RealModelProvider } from './real.provider.js';

const enabled = process.env.AGENT_REAL_MODEL_TEST === 'true' && isRealModelConfigured();

describe.skipIf(!enabled)('RealModelProvider integration', () => {
  it('can call the configured OpenAI-compatible endpoint', async () => {
    const result = await new RealModelProvider().generate({
      prompt: 'Reply with {"pong":true} only.',
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 32,
    });
    expect(result.provider).toBe('real');
    expect(result.text.length).toBeGreaterThan(0);
  });
});

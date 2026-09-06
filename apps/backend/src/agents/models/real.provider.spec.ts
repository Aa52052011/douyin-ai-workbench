import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { RealModelProvider } from './real.provider.js';

describe('RealModelProvider', () => {
  beforeEach(() => {
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;
  });

  afterEach(() => {
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;
    vi.unstubAllGlobals();
  });

  it('fails when the real provider is not configured', async () => {
    const provider = new RealModelProvider();
    await expect(provider.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED,
    });
  });

  it('maps HTTP failures without leaking the API key', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://example.test/v1';
    process.env.MODEL_NAME = 'demo-model';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    );
    const provider = new RealModelProvider();
    await expect(provider.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: ErrorCode.MODEL_REQUEST_FAILED,
    });
    try {
      await provider.generate({ prompt: 'hi' });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('sk-secret-test-key');
    }
  });

  it('maps abort to MODEL_TIMEOUT', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://example.test/v1';
    process.env.MODEL_NAME = 'demo-model';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    );
    const provider = new RealModelProvider();
    await expect(provider.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: ErrorCode.MODEL_TIMEOUT,
    });
  });

  it('keeps provider usage null when the vendor omits it', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://example.test/v1';
    process.env.MODEL_NAME = 'demo-model';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const provider = new RealModelProvider();
    const result = await provider.generate({ prompt: 'hi', responseFormat: 'json' });
    expect(result.provider).toBe('real');
    expect(result.usage.inputTokens).toBeNull();
    expect(result.usage.estimatedCost).toBeNull();
    expect(result.text).toContain('ok');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  joinOpenAiCompatibleChatCompletionsUrl,
  RealModelProvider,
  resolveRealModelTimeoutMs,
} from './real.provider.js';

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
      message: 'Model request failed (HTTP 500)',
      httpStatus: 500,
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

  it('aborts using request.timeoutMs instead of waiting the production default', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://example.test/v1';
    process.env.MODEL_NAME = 'demo-model';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ),
    );
    const provider = new RealModelProvider();
    const started = Date.now();
    await expect(provider.generate({ prompt: 'hi', timeoutMs: 40 })).rejects.toMatchObject({
      code: ErrorCode.MODEL_TIMEOUT,
    });
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('normalizes OpenAI-compatible chat completion URLs', () => {
    const expected = 'https://api.router.one/v1/chat/completions';
    expect(joinOpenAiCompatibleChatCompletionsUrl('https://api.router.one')).toBe(expected);
    expect(joinOpenAiCompatibleChatCompletionsUrl('https://api.router.one/')).toBe(expected);
    expect(joinOpenAiCompatibleChatCompletionsUrl('https://api.router.one/v1')).toBe(expected);
    expect(joinOpenAiCompatibleChatCompletionsUrl('https://api.router.one/v1/')).toBe(expected);
    expect(expected).not.toContain('/v1/v1/');
    expect(expected.split('/chat/completions').length - 1).toBe(1);
  });

  it('posts to the normalized chat completions URL', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://api.router.one';
    process.env.MODEL_NAME = 'demo-model';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.router.one/v1/chat/completions');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'PONG' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new RealModelProvider();
    await provider.generate({ prompt: 'hi' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts fetch when the agent execution signal fires', async () => {
    process.env.MODEL_API_KEY = 'sk-secret-test-key';
    process.env.MODEL_BASE_URL = 'https://example.test/v1';
    process.env.MODEL_NAME = 'demo-model';
    let fetchSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            fetchSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ),
    );
    const provider = new RealModelProvider();
    const { runWithTimeout } = await import('../timeout.js');
    await expect(runWithTimeout(() => provider.generate({ prompt: 'hi', timeoutMs: 5_000 }), 30)).rejects.toMatchObject({
      code: 'AGENT_TIMEOUT',
    });
    expect(fetchSignal?.aborted).toBe(true);
  });

  it('uses request.timeoutMs when present and defaults to the primary route budget', () => {
    expect(resolveRealModelTimeoutMs(40)).toBe(40);
    expect(resolveRealModelTimeoutMs(135_000)).toBe(135_000);
    expect(resolveRealModelTimeoutMs(undefined)).toBe(135_000);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { MockModelProvider } from './mock.provider.js';
import { ModelRouter } from './model.router.js';
import { RealModelProvider } from './real.provider.js';
import { runMeteringScope } from '../../usage/metering-context.js';
import type { UsageMeteringService } from '../../usage/usage-metering.service.js';

describe('ModelRouter', () => {
  it('routes generate() through MockModelProvider without a real LLM', async () => {
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
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

  it('records a separate UsageEvent for schema repair vs primary', async () => {
    const startUsage = vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => ({
      id: idempotencyKey,
      reused: false,
    }));
    const completeUsage = vi.fn(async () => undefined);
    const metering = { startUsage, completeUsage, failUsage: vi.fn() } as unknown as UsageMeteringService;
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);
    await runMeteringScope(
      {
        tenantId: 'tenant',
        workspaceId: 'ws',
        agentRunId: 'run-1',
        stage: 'AGENT',
      },
      async () => {
        await router.generate({
          prompt: 'primary json',
          agentId: 'script.generation',
          tenantId: 'tenant',
        });
        await router.generate({
          prompt: 'primary json\nrepair the schema',
          agentId: 'script.generation',
          tenantId: 'tenant',
        });
      },
    );
    expect(startUsage).toHaveBeenCalledTimes(2);
    expect(startUsage.mock.calls[0]?.[0].idempotencyKey).not.toBe(startUsage.mock.calls[1]?.[0].idempotencyKey);
    expect(completeUsage).toHaveBeenCalledTimes(2);
  });

  it('uses a new attempt key when the same prompt is generated again', async () => {
    const startUsage = vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => ({
      id: idempotencyKey,
      reused: false,
    }));
    const metering = { startUsage, completeUsage: vi.fn(), failUsage: vi.fn() } as unknown as UsageMeteringService;
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);
    await runMeteringScope(
      { tenantId: 'tenant', workspaceId: 'ws', agentRunId: 'run-retry', stage: 'AGENT' },
      async () => {
        await router.generate({ prompt: 'same', agentId: 'dogfood.preflight', tenantId: 'tenant' });
        await router.generate({ prompt: 'same', agentId: 'dogfood.preflight', tenantId: 'tenant' });
      },
    );
    expect(startUsage).toHaveBeenCalledTimes(2);
    expect(startUsage.mock.calls[0]?.[0].idempotencyKey).not.toBe(startUsage.mock.calls[1]?.[0].idempotencyKey);
  });

  it('reuses metering when the same attemptKey is supplied twice while pending', async () => {
    const startUsage = vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => ({
      id: idempotencyKey,
      reused: startUsage.mock.calls.length > 1,
    }));
    const metering = { startUsage, completeUsage: vi.fn(), failUsage: vi.fn() } as unknown as UsageMeteringService;
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider(), metering);
    await runMeteringScope(
      {
        tenantId: 'tenant',
        workspaceId: 'ws',
        attemptKey: 'fixed-attempt',
        agentRunId: 'run-same',
        stage: 'AGENT',
      },
      async () => {
        await router.generate({ prompt: 'same', agentId: 'dogfood.preflight', tenantId: 'tenant' });
        await router.generate({ prompt: 'same', agentId: 'dogfood.preflight', tenantId: 'tenant' });
      },
    );
    expect(startUsage.mock.calls[0]?.[0].idempotencyKey).toBe(startUsage.mock.calls[1]?.[0].idempotencyKey);
  });

  it('applies the primary route timeout budget instead of the caller agent timeout', async () => {
    const generate = vi.fn(async (request: { timeoutMs?: number }) => {
      expect(request.timeoutMs).toBe(135_000);
      return {
        provider: 'mock',
        text: 'ok',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
      };
    });
    const mock = { id: 'mock', generate } as unknown as MockModelProvider;
    const router = new ModelRouter(mock, new RealModelProvider());
    await router.generate({
      prompt: 'hello',
      agentId: 'account.positioning',
      tenantId: 'tenant',
      timeoutMs: 210_000,
    });
    expect(generate).toHaveBeenCalledOnce();
  });
});

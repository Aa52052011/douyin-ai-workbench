import { describe, expect, it, vi } from 'vitest';
import type { UsageMeteringService } from './usage-metering.service.js';
import { withUsageMetering } from './with-usage-metering.js';

describe('withUsageMetering', () => {
  it('does not fail the business call when metering write fails', async () => {
    const metering = {
      startUsage: vi.fn(async () => {
        throw new Error('db down');
      }),
      completeUsage: vi.fn(),
      failUsage: vi.fn(),
    } as unknown as UsageMeteringService;
    const result = await withUsageMetering(
      metering,
      {
        tenantId: 't',
        workspaceId: 'w',
        operationType: 'AGENT_RUN',
        provider: 'mock',
        resourceType: 'LLM',
        idempotencyKey: 'k1',
      },
      async () => ({ ok: true }),
      () => ({ totalUnits: 1, unitType: 'TOKENS' }),
    );
    expect(result).toEqual({ ok: true });
    expect(metering.completeUsage).not.toHaveBeenCalled();
  });

  it('records failUsage when the provider throws, then rethrows the provider error', async () => {
    const metering = {
      startUsage: vi.fn(async () => ({ id: 'evt-1', reused: false })),
      completeUsage: vi.fn(),
      failUsage: vi.fn(async () => undefined),
    } as unknown as UsageMeteringService;
    await expect(
      withUsageMetering(
        metering,
        {
          tenantId: 't',
          workspaceId: 'w',
          operationType: 'IMAGE_GENERATION',
          provider: 'wanx',
          resourceType: 'AI_IMAGE',
          idempotencyKey: 'k2',
        },
        async () => {
          throw new Error('provider boom');
        },
        () => ({ imageCount: 1 }),
      ),
    ).rejects.toThrow('provider boom');
    expect(metering.failUsage).toHaveBeenCalledWith('t', 'evt-1');
  });

  it('still returns provider success if completeUsage throws', async () => {
    const metering = {
      startUsage: vi.fn(async () => ({ id: 'evt-2', reused: false })),
      completeUsage: vi.fn(async () => {
        throw new Error('ledger write failed');
      }),
      failUsage: vi.fn(),
    } as unknown as UsageMeteringService;
    const result = await withUsageMetering(
      metering,
      {
        tenantId: 't',
        workspaceId: 'w',
        operationType: 'AGENT_RUN',
        provider: 'mock',
        resourceType: 'LLM',
        idempotencyKey: 'k3',
      },
      async () => 'done',
      () => ({ totalUnits: 4, unitType: 'TOKENS' }),
    );
    expect(result).toBe('done');
  });
});

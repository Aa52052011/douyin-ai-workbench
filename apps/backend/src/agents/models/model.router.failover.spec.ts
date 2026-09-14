import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError, MODEL_BUSY_USER_MESSAGE } from '../agent.errors.js';
import { runMeteringScope } from '../../usage/metering-context.js';
import type { UsageMeteringService } from '../../usage/usage-metering.service.js';
import { runWithTimeout } from '../timeout.js';
import { MockModelProvider } from './mock.provider.js';
import { modelRouteKey, ModelRouteHealthRegistry } from './model-route-health.js';
import { ModelRouter } from './model.router.js';
import type { ModelGenerateRequest, ModelGenerateResult } from './model.types.js';
import type { RealModelProvider } from './real.provider.js';

const PRIMARY = 'openai/gpt-5.5';
const BACKUP = 'anthropic/claude-haiku-4.5';

function ok(text = 'OK'): ModelGenerateResult {
  return {
    text,
    provider: 'real',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: null },
  };
}

function httpError(status: number): AgentError {
  return new AgentError(ErrorCode.MODEL_REQUEST_FAILED, `Model request failed (HTTP ${status})`, status >= 500, {
    httpStatus: status,
  });
}

function enableFailover(env: { threshold?: string; cooldown?: string } = {}): void {
  process.env.MODEL_NAME = PRIMARY;
  process.env.MODEL_FALLBACK_1_NAME = BACKUP;
  process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD = env.threshold ?? '2';
  process.env.MODEL_CIRCUIT_COOLDOWN_MS = env.cooldown ?? '900000';
}

function disableFailover(): void {
  delete process.env.MODEL_FALLBACK_1_NAME;
  delete process.env.MODEL_CIRCUIT_FAILURE_THRESHOLD;
  delete process.env.MODEL_CIRCUIT_COOLDOWN_MS;
  delete process.env.MODEL_ROUTE_TIMEOUT_MS;
  delete process.env.MODEL_BACKUP_ROUTE_TIMEOUT_MS;
}

function scriptedReal(
  handler: (request: ModelGenerateRequest) => Promise<ModelGenerateResult> | ModelGenerateResult,
): RealModelProvider & { generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async (request: ModelGenerateRequest) => handler(request));
  return { id: 'real', generate } as unknown as RealModelProvider & { generate: ReturnType<typeof vi.fn> };
}

function meteringStub() {
  const starts: Array<Record<string, unknown>> = [];
  const service = {
    startUsage: vi.fn(async (input: { idempotencyKey: string; metadata?: Record<string, unknown>; model?: string }) => {
      starts.push(input);
      return { id: input.idempotencyKey, reused: false };
    }),
    completeUsage: vi.fn(async () => undefined),
    failUsage: vi.fn(async () => undefined),
  } as unknown as UsageMeteringService;
  return { service, starts, completeUsage: service.completeUsage as ReturnType<typeof vi.fn>, failUsage: service.failUsage as ReturnType<typeof vi.fn> };
}

function routerFor(real: RealModelProvider, health?: ModelRouteHealthRegistry, metering?: UsageMeteringService) {
  const router = new ModelRouter(new MockModelProvider(), real, metering, health);
  router.defaultProviderId = 'real';
  return router;
}

const request = {
  prompt: 'business',
  agentId: 'system.echo',
  tenantId: 'tenant',
  provider: 'real' as const,
};

describe('ModelRouter failover', () => {
  beforeEach(() => {
    enableFailover();
  });

  afterEach(() => {
    disableFailover();
  });

  it('does not call Backup when Primary succeeds', async () => {
    const real = scriptedReal((req) => {
      expect(req.model).toBe(PRIMARY);
      return ok('primary');
    });
    const result = await routerFor(real).generate(request);
    expect(result.text).toBe('primary');
    expect(real.generate).toHaveBeenCalledOnce();
  });

  it('fails over HTTP 503 to Backup success', async () => {
    const real = scriptedReal((req) => {
      if (req.model === PRIMARY) {
        throw httpError(503);
      }
      return ok('backup');
    });
    const result = await routerFor(real).generate(request);
    expect(result.text).toBe('backup');
    expect(real.generate).toHaveBeenCalledTimes(2);
  });

  it('fails over HTTP 502 to Backup success', async () => {
    const real = scriptedReal((req) => (req.model === PRIMARY ? Promise.reject(httpError(502)) : ok('backup')));
    expect((await routerFor(real).generate(request)).text).toBe('backup');
  });

  it('fails over HTTP 429 to Backup success', async () => {
    const real = scriptedReal((req) => (req.model === PRIMARY ? Promise.reject(httpError(429)) : ok('backup')));
    expect((await routerFor(real).generate(request)).text).toBe('backup');
  });

  it('fails over MODEL_TIMEOUT to Backup success', async () => {
    const real = scriptedReal((req) =>
      req.model === PRIMARY ? Promise.reject(new AgentError(ErrorCode.MODEL_TIMEOUT, undefined, true)) : ok('backup'),
    );
    expect((await routerFor(real).generate(request)).text).toBe('backup');
  });

  it('fails over network reset to Backup success', async () => {
    const real = scriptedReal((req) =>
      req.model === PRIMARY
        ? Promise.reject(new AgentError(ErrorCode.MODEL_REQUEST_FAILED, undefined, true, { networkCode: 'ECONNRESET' }))
        : ok('backup'),
    );
    expect((await routerFor(real).generate(request)).text).toBe('backup');
  });

  it('does not call Backup on Primary HTTP 400', async () => {
    const real = scriptedReal((req) => {
      if (req.model === PRIMARY) {
        throw httpError(400);
      }
      return ok('backup');
    });
    await expect(routerFor(real).generate(request)).rejects.toMatchObject({ httpStatus: 400 });
    expect(real.generate).toHaveBeenCalledOnce();
  });

  it('does not call Backup on Primary HTTP 401', async () => {
    const real = scriptedReal((req) => {
      if (req.model === PRIMARY) {
        throw httpError(401);
      }
      return ok();
    });
    await expect(routerFor(real).generate(request)).rejects.toMatchObject({ httpStatus: 401 });
    expect(real.generate).toHaveBeenCalledOnce();
  });

  it('does not call Backup on Primary HTTP 403', async () => {
    const real = scriptedReal((req) => {
      if (req.model === PRIMARY) {
        throw httpError(403);
      }
      return ok();
    });
    await expect(routerFor(real).generate(request)).rejects.toMatchObject({ httpStatus: 403 });
    expect(real.generate).toHaveBeenCalledOnce();
  });

  it('does not call Backup after AGENT_TIMEOUT termination', async () => {
    const real = scriptedReal(async (req) => {
      if (req.model === PRIMARY) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        throw httpError(503);
      }
      throw new Error('backup-must-not-run');
    });
    await expect(runWithTimeout(() => routerFor(real).generate(request), 10)).rejects.toMatchObject({
      code: ErrorCode.AGENT_TIMEOUT,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(real.generate.mock.calls.some((call) => call[0].model === BACKUP)).toBe(false);
  });

  it('opens Primary circuit after 2 consecutive eligible failures', async () => {
    const health = new ModelRouteHealthRegistry();
    const real = scriptedReal((req) => (req.model === PRIMARY ? Promise.reject(httpError(503)) : ok('backup')));
    const router = routerFor(real, health);
    await router.generate(request);
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).state).toBe('HEALTHY');
    await router.generate(request);
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).state).toBe('OPEN_CIRCUIT');
  });

  it('skips Primary when OPEN_CIRCUIT and calls Backup', async () => {
    const health = new ModelRouteHealthRegistry();
    const key = modelRouteKey('real', PRIMARY);
    health.recordEligibleFailure(key, 2, 900_000);
    health.recordEligibleFailure(key, 2, 900_000);
    const real = scriptedReal((req) => {
      if (req.model === PRIMARY) {
        throw new Error('primary-must-be-skipped');
      }
      return ok('backup');
    });
    const result = await routerFor(real, health).generate(request);
    expect(result.text).toBe('backup');
    expect(real.generate.mock.calls.every((call) => call[0].model !== PRIMARY || call[0].prompt === 'Reply with exactly: OK')).toBe(
      true,
    );
    expect(real.generate.mock.calls.some((call) => call[0].model === PRIMARY && call[0].prompt === 'business')).toBe(false);
  });

  it('does not probe before cooldown and uses Backup', async () => {
    let now = 5_000;
    const health = new ModelRouteHealthRegistry(() => now);
    const key = modelRouteKey('real', PRIMARY);
    health.recordEligibleFailure(key, 2, 900_000);
    health.recordEligibleFailure(key, 2, 900_000);
    now = 5_000 + 100;
    const real = scriptedReal((req) => {
      if (req.prompt === 'Reply with exactly: OK') {
        throw new Error('probe-must-not-run');
      }
      return ok('backup');
    });
    await routerFor(real, health).generate(request);
    expect(real.generate.mock.calls.some((call) => call[0].prompt === 'Reply with exactly: OK')).toBe(false);
  });

  it('runs one recovery probe after cooldown, then HEALTHY on success', async () => {
    let now = 5_000;
    const health = new ModelRouteHealthRegistry(() => now);
    const key = modelRouteKey('real', PRIMARY);
    health.recordEligibleFailure(key, 2, 900_000);
    health.recordEligibleFailure(key, 2, 900_000);
    now = 5_000 + 900_000;
    const real = scriptedReal((req) => {
      if (req.prompt === 'Reply with exactly: OK') {
        return ok('OK');
      }
      expect(req.model).toBe(PRIMARY);
      return ok('primary-after-probe');
    });
    const result = await routerFor(real, health).generate(request);
    expect(result.text).toBe('primary-after-probe');
    expect(real.generate.mock.calls.filter((call) => call[0].prompt === 'Reply with exactly: OK')).toHaveLength(1);
    expect(health.snapshot(key).state).toBe('HEALTHY');
  });

  it('re-opens Primary when recovery probe fails', async () => {
    let now = 5_000;
    const health = new ModelRouteHealthRegistry(() => now);
    const key = modelRouteKey('real', PRIMARY);
    health.recordEligibleFailure(key, 2, 900_000);
    health.recordEligibleFailure(key, 2, 900_000);
    now = 5_000 + 900_000;
    const real = scriptedReal((req) => {
      if (req.prompt === 'Reply with exactly: OK') {
        throw httpError(503);
      }
      if (req.model === PRIMARY) {
        throw new Error('business-primary-must-skip');
      }
      return ok('backup');
    });
    const result = await routerFor(real, health).generate(request);
    expect(result.text).toBe('backup');
    expect(health.snapshot(key).state).toBe('OPEN_CIRCUIT');
  });

  it('allows only one concurrent recovery probe', async () => {
    let now = 5_000;
    const health = new ModelRouteHealthRegistry(() => now);
    const key = modelRouteKey('real', PRIMARY);
    health.recordEligibleFailure(key, 2, 900_000);
    health.recordEligibleFailure(key, 2, 900_000);
    now = 5_000 + 900_000;
    let probes = 0;
    const real = scriptedReal(async (req) => {
      if (req.prompt === 'Reply with exactly: OK') {
        probes += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        throw httpError(503);
      }
      return ok('backup');
    });
    const router = routerFor(real, health);
    await Promise.all([router.generate(request), router.generate(request)]);
    expect(probes).toBe(1);
  });

  it('preserves Primary FAILED usage and a separate Backup SUCCEEDED attempt', async () => {
    const metering = meteringStub();
    const real = scriptedReal((req) => (req.model === PRIMARY ? Promise.reject(httpError(503)) : ok('backup')));
    await runMeteringScope(
      { tenantId: 'tenant', workspaceId: 'ws', agentRunId: 'run-1', stage: 'AGENT' },
      () => routerFor(real, undefined, metering.service).generate(request),
    );
    expect(metering.starts).toHaveLength(2);
    expect(metering.failUsage).toHaveBeenCalledOnce();
    expect(metering.completeUsage).toHaveBeenCalledOnce();
    const attempts = metering.starts.map((item) => (item.metadata as { attempt: string }).attempt);
    expect(attempts[0]).not.toBe(attempts[1]);
    expect((metering.starts[0]?.metadata as { fallbackUsed: boolean }).fallbackUsed).toBe(false);
    expect((metering.starts[1]?.metadata as { fallbackUsed: boolean }).fallbackUsed).toBe(true);
    expect(metering.starts[0]?.model).toBe(PRIMARY);
    expect(metering.starts[1]?.model).toBe(BACKUP);
  });

  it('returns a user-safe error when both routes fail', async () => {
    const real = scriptedReal(() => {
      throw httpError(503);
    });
    await expect(routerFor(real).generate(request)).rejects.toMatchObject({
      code: ErrorCode.MODEL_ERROR,
      message: MODEL_BUSY_USER_MESSAGE,
    });
  });

  it('keeps UNPRICED usage cost as null rather than zero', async () => {
    const metering = meteringStub();
    const real = scriptedReal((req) => (req.model === PRIMARY ? Promise.reject(httpError(503)) : ok('backup')));
    const result = await runMeteringScope(
      { tenantId: 'tenant', workspaceId: 'ws', agentRunId: 'run-cost', stage: 'AGENT' },
      () => routerFor(real, undefined, metering.service).generate(request),
    );
    expect(result.usage.estimatedCost).toBeNull();
    expect(JSON.stringify(metering.starts)).not.toMatch(/"estimatedCost":0/);
  });

  it('keeps single-model behavior when fallback is not configured', async () => {
    disableFailover();
    process.env.MODEL_NAME = PRIMARY;
    const real = scriptedReal(() => {
      throw httpError(503);
    });
    await expect(routerFor(real).generate(request)).rejects.toMatchObject({ httpStatus: 503 });
    expect(real.generate).toHaveBeenCalledOnce();
  });

  it('does not run real failover for mock provider', async () => {
    const real = scriptedReal(() => {
      throw new Error('real-must-not-run');
    });
    const router = new ModelRouter(new MockModelProvider(), real);
    const result = await router.generate({ prompt: 'hello', systemPrompt: 'echo', agentId: 'system.echo', tenantId: 't' });
    expect(result.provider).toBe('mock');
    expect(real.generate).not.toHaveBeenCalled();
  });

  it('does not count successful schema-repair generates as circuit failures', async () => {
    const health = new ModelRouteHealthRegistry();
    const real = scriptedReal(() => ok('{"ok":true}'));
    const router = routerFor(real, health);
    await router.generate({ ...request, prompt: 'primary json' });
    await router.generate({ ...request, prompt: 'primary json\nrepair the schema' });
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).state).toBe('HEALTHY');
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).failureCount).toBe(0);
    expect(real.generate.mock.calls.every((call) => call[0].model === PRIMARY)).toBe(true);
  });

  it('times out a hanging Primary as MODEL_TIMEOUT then uses Backup', async () => {
    process.env.MODEL_ROUTE_TIMEOUT_MS = '40';
    process.env.MODEL_BACKUP_ROUTE_TIMEOUT_MS = '80';
    const metering = meteringStub();
    const real = scriptedReal(async (req) => {
      if (req.model === PRIMARY) {
        await new Promise((_resolve, reject) => {
          req.abortSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      expect(req.timeoutMs).toBeLessThanOrEqual(80);
      return ok('backup');
    });
    const result = await runWithTimeout(
      () =>
        runMeteringScope(
          { tenantId: 'tenant', workspaceId: 'ws', agentRunId: 'run-hang', stage: 'AGENT' },
          () => routerFor(real, undefined, metering.service).generate(request),
        ),
      250,
    );
    expect(result.text).toBe('backup');
    expect(metering.failUsage).toHaveBeenCalledOnce();
    expect(metering.completeUsage).toHaveBeenCalledOnce();
    const attempts = metering.starts.map((item) => (item.metadata as { attempt: string }).attempt);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(real.generate.mock.calls[0]?.[0].timeoutMs).toBe(40);
    expect(real.generate.mock.calls.some((call) => call[0].model === BACKUP)).toBe(true);
  });

  it('does not start Backup when remaining agent budget is below the minimum attempt', async () => {
    process.env.MODEL_ROUTE_TIMEOUT_MS = '40';
    process.env.MODEL_BACKUP_ROUTE_TIMEOUT_MS = '80';
    const real = scriptedReal(async (req) => {
      if (req.model === PRIMARY) {
        await new Promise((_resolve, reject) => {
          req.abortSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      throw new Error('backup-must-not-run');
    });
    await expect(runWithTimeout(() => routerFor(real).generate(request), 120)).rejects.toMatchObject({
      code: ErrorCode.AGENT_TIMEOUT,
    });
    expect(real.generate.mock.calls.some((call) => call[0].model === BACKUP)).toBe(false);
  });

  it('counts MODEL_TIMEOUT as a circuit eligible failure and not AGENT_TIMEOUT', async () => {
    process.env.MODEL_ROUTE_TIMEOUT_MS = '30';
    const health = new ModelRouteHealthRegistry();
    const real = scriptedReal(async (req) => {
      if (req.model === PRIMARY) {
        await new Promise((_resolve, reject) => {
          req.abortSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      return ok('backup');
    });
    const router = routerFor(real, health);
    await runWithTimeout(() => router.generate(request), 250);
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).failureCount).toBe(1);
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).state).toBe('HEALTHY');
  });

  it('does not count AGENT_TIMEOUT as a circuit failure', async () => {
    const health = new ModelRouteHealthRegistry();
    const real = scriptedReal(() => ok('unused'));
    await expect(runWithTimeout(() => routerFor(real, health).generate(request), 10)).rejects.toMatchObject({
      code: ErrorCode.AGENT_TIMEOUT,
    });
    expect(health.snapshot(modelRouteKey('real', PRIMARY)).failureCount).toBe(0);
  });

  it('refuses a schema-repair generate when remaining agent budget is insufficient', async () => {
    process.env.MODEL_ROUTE_TIMEOUT_MS = '100';
    const real = scriptedReal(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return ok('{"ok":true}');
    });
    const router = routerFor(real);
    await expect(
      runWithTimeout(async () => {
        await router.generate({ ...request, prompt: 'primary json' });
        await router.generate({ ...request, prompt: 'primary json\nrepair the schema' });
      }, 120),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_TIMEOUT });
    expect(real.generate).toHaveBeenCalledOnce();
  });
});

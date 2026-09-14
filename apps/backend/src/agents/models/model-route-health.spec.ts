import { describe, expect, it } from 'vitest';
import { modelRouteKey, ModelRouteHealthRegistry } from './model-route-health.js';

describe('ModelRouteHealthRegistry', () => {
  it('keeps failureCount=1 as HEALTHY and opens on the second eligible failure', () => {
    let now = 1_000;
    const registry = new ModelRouteHealthRegistry(() => now);
    const key = modelRouteKey('real', 'openai/gpt-5.5');
    expect(registry.recordEligibleFailure(key, 2, 900_000).state).toBe('HEALTHY');
    expect(registry.snapshot(key).failureCount).toBe(1);
    const opened = registry.recordEligibleFailure(key, 2, 900_000);
    expect(opened.state).toBe('OPEN_CIRCUIT');
    expect(opened.nextProbeAt).toBe(1_000 + 900_000);
    now = 1_000 + 899_999;
    expect(registry.isProbeEligible(key)).toBe(false);
    now = 1_000 + 900_000;
    expect(registry.isProbeEligible(key)).toBe(true);
  });

  it('resets to HEALTHY on success', () => {
    const registry = new ModelRouteHealthRegistry();
    const key = modelRouteKey('real', 'openai/gpt-5.5');
    registry.recordEligibleFailure(key, 2, 10);
    registry.recordEligibleFailure(key, 2, 10);
    registry.recordSuccess(key);
    expect(registry.snapshot(key)).toMatchObject({ state: 'HEALTHY', failureCount: 0, openedAt: null });
  });
});

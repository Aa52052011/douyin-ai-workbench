import { describe, expect, it } from 'vitest';
import { InMemoryOAuthStateStore } from './in-memory-oauth-state.store.js';
import {
  buildOAuthStateContext,
  generateOAuthState,
  hashOAuthState,
  oauthStateRedisKey,
} from './oauth-state.js';

describe('OAuth state store', () => {
  it('stores hashed state with TTL and consumes once', async () => {
    const store = new InMemoryOAuthStateStore();
    const state = generateOAuthState();
    const context = buildOAuthStateContext({
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      requestedScopes: ['user_info'],
      ttlMs: 10_000,
    });
    await store.save(state, context, 10_000);
    expect(oauthStateRedisKey(state)).not.toContain(state);
    expect(hashOAuthState(state)).not.toBe(state);
    const first = await store.consume(state);
    expect(first.ok).toBe(true);
    const second = await store.consume(state);
    expect(second).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects wrong and expired state', async () => {
    const store = new InMemoryOAuthStateStore();
    const state = generateOAuthState();
    await store.save(
      state,
      buildOAuthStateContext({
        tenantId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        requestedScopes: ['user_info'],
        ttlMs: 1,
      }),
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await store.consume(state)).toEqual({ ok: false, reason: 'expired' });
    expect(await store.consume(generateOAuthState())).toEqual({ ok: false, reason: 'missing' });
  });

  it('allows only one concurrent consume to succeed', async () => {
    const store = new InMemoryOAuthStateStore();
    const state = generateOAuthState();
    await store.save(
      state,
      buildOAuthStateContext({
        tenantId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        requestedScopes: ['user_info'],
      }),
      60_000,
    );
    const results = await Promise.all([store.consume(state), store.consume(state), store.consume(state)]);
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => !item.ok)).toHaveLength(2);
  });

  it('does not encode tenantId as the state value', () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    expect(generateOAuthState()).not.toBe(tenantId);
    expect(generateOAuthState()).not.toEqual(generateOAuthState());
    expect(generateOAuthState().length).toBeGreaterThanOrEqual(32);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { generateOAuthState, buildOAuthStateContext } from './oauth-state.js';
import { RedisOAuthStateStore } from './redis-oauth-state.store.js';

const enabled = process.env.RUN_REDIS_TESTS === 'true' && Boolean(process.env.REDIS_URL?.trim());

describe.skipIf(!enabled)('Redis OAuth state store', () => {
  let store: RedisOAuthStateStore | undefined;

  afterAll(async () => {
    await store?.onModuleDestroy();
  });

  it('consumes hashed state at most once', async () => {
    store = new RedisOAuthStateStore(process.env.REDIS_URL as string);
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
    const first = await store.consume(state);
    const second = await store.consume(state);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });
});

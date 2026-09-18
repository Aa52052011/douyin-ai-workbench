import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WORKER_LOCK_RELEASE_LUA,
  WORKER_LOCK_RENEW_LUA,
  WorkerInstanceLock,
  shouldAcquireWorkerSingleton,
} from './worker-instance-lock.js';

class MemoryRedis {
  store = new Map<string, { value: string; expiresAt: number }>();
  evals: string[] = [];

  async set(key: string, value: string, _mode: 'PX', ttl: number, nx: 'NX'): Promise<string | null> {
    void _mode;
    void nx;
    const now = Date.now();
    const current = this.store.get(key);
    if (current && current.expiresAt > now) {
      return null;
    }
    this.store.set(key, { value, expiresAt: now + ttl });
    return 'OK';
  }

  async eval(script: string, _n: number, key: string, token: string, ttl?: string): Promise<number> {
    void _n;
    this.evals.push(script);
    const row = this.store.get(key);
    if (!row || row.value !== token) {
      return 0;
    }
    if (script === WORKER_LOCK_RELEASE_LUA) {
      this.store.delete(key);
      return 1;
    }
    if (script === WORKER_LOCK_RENEW_LUA) {
      row.expiresAt = Date.now() + Number(ttl);
      return 1;
    }
    return 0;
  }
}

describe('WorkerInstanceLock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips singleton acquire in unit tests by default', () => {
    expect(shouldAcquireWorkerSingleton({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldAcquireWorkerSingleton({ NODE_ENV: 'test', ACF_WORKER_SINGLETON: 'true' })).toBe(true);
    expect(shouldAcquireWorkerSingleton({ NODE_ENV: 'production' })).toBe(true);
    expect(shouldAcquireWorkerSingleton({ NODE_ENV: 'development', ACF_WORKER_SINGLETON: 'false' })).toBe(false);
  });

  it('acquires NX and refuses a second owner', async () => {
    const redis = new MemoryRedis();
    const a = new WorkerInstanceLock(redis, randomUUID(), 'acf:worker:singleton', 30_000, 10_000);
    const b = new WorkerInstanceLock(redis, randomUUID(), 'acf:worker:singleton', 30_000, 10_000);
    expect(await a.acquire()).toBe(true);
    expect(await b.acquire()).toBe(false);
  });

  it('releases only the owning token', async () => {
    const redis = new MemoryRedis();
    const token = randomUUID();
    const owner = new WorkerInstanceLock(redis, token, 'acf:worker:singleton', 30_000, 10_000);
    const stranger = new WorkerInstanceLock(redis, randomUUID(), 'acf:worker:singleton', 30_000, 10_000);
    expect(await owner.acquire()).toBe(true);
    await stranger.release();
    expect(redis.store.has('acf:worker:singleton')).toBe(true);
    await owner.release();
    expect(redis.store.has('acf:worker:singleton')).toBe(false);
    expect(await stranger.acquire()).toBe(true);
  });

  it('renews TTL only for the owner', async () => {
    const redis = new MemoryRedis();
    const owner = new WorkerInstanceLock(redis, randomUUID(), 'acf:worker:singleton', 30_000, 10_000);
    const other = new WorkerInstanceLock(redis, randomUUID(), 'acf:worker:singleton', 30_000, 10_000);
    expect(await owner.acquire()).toBe(true);
    expect(await owner.renew()).toBe(true);
    expect(await other.renew()).toBe(false);
  });
});

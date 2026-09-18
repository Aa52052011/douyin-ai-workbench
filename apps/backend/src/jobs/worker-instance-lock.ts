export const WORKER_INSTANCE_LOCK_KEY = 'acf:worker:singleton';
export const DEFAULT_WORKER_LOCK_TTL_MS = 30_000;
export const DEFAULT_WORKER_LOCK_HEARTBEAT_MS = 10_000;

export const WORKER_LOCK_RENEW_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";

export const WORKER_LOCK_RELEASE_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

export class WorkerInstanceLockHeldError extends Error {
  constructor() {
    super('Worker instance lock already held');
    this.name = 'WorkerInstanceLockHeldError';
  }
}

export function resolveWorkerLockKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.ACF_WORKER_LOCK_KEY?.trim() || WORKER_INSTANCE_LOCK_KEY;
}

export function resolveWorkerLockTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.ACF_WORKER_LOCK_TTL_MS, DEFAULT_WORKER_LOCK_TTL_MS);
}

export function resolveWorkerLockHeartbeatMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.ACF_WORKER_LOCK_HEARTBEAT_MS, DEFAULT_WORKER_LOCK_HEARTBEAT_MS);
}

export function shouldAcquireWorkerSingleton(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ACF_WORKER_SINGLETON === 'false') {
    return false;
  }
  if (env.NODE_ENV === 'test' && env.ACF_WORKER_SINGLETON !== 'true') {
    return false;
  }
  return true;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.floor(n);
}

export type RedisLockClient = {
  set(key: string, value: string, expiryMode: 'PX', ttl: number, setMode: 'NX'): Promise<string | null>;
  eval(script: string, numKeys: number, key: string, token: string, ttl?: string): Promise<unknown>;
};

export class WorkerInstanceLock {
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private released = false;

  constructor(
    private readonly redis: RedisLockClient,
    readonly token: string,
    private readonly key: string,
    private readonly ttlMs: number,
    private readonly heartbeatMs: number,
  ) {
    if (heartbeatMs >= ttlMs) {
      throw new Error('Worker lock heartbeat must be less than TTL');
    }
  }

  async acquire(): Promise<boolean> {
    const result = await this.redis.set(this.key, this.token, 'PX', this.ttlMs, 'NX');
    return result === 'OK';
  }

  startHeartbeat(onLost?: () => void): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.renew().then((ok) => {
        if (!ok) {
          onLost?.();
        }
      });
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }

  async renew(): Promise<boolean> {
    if (this.released) {
      return false;
    }
    const result = await this.redis.eval(WORKER_LOCK_RENEW_LUA, 1, this.key, this.token, String(this.ttlMs));
    return Number(result) === 1;
  }

  async release(): Promise<void> {
    this.stopHeartbeat();
    if (this.released) {
      return;
    }
    this.released = true;
    await this.redis.eval(WORKER_LOCK_RELEASE_LUA, 1, this.key, this.token);
  }
}

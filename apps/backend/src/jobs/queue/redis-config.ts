import { Redis } from 'ioredis';
import { RuntimeConfigError } from '../../config/runtime-config-error.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';

export function resolveRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
  }
  return url;
}

export function usesInMemoryJobQueue(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.RUN_REDIS_TESTS !== 'true';
}

export async function assertRedisReachable(url = process.env.REDIS_URL?.trim()): Promise<void> {
  if (!url) {
    throw new RuntimeConfigError(['REDIS_URL is required']);
  }
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    await redis.ping();
  } catch {
    throw new RuntimeConfigError(['REDIS_URL is unreachable']);
  } finally {
    redis.disconnect();
  }
}

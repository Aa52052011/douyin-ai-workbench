import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { OAuthStateConsumeResult, OAuthStateContext, OAuthStateStore } from './oauth-state.js';
import { oauthStateRedisKey } from './oauth-state.js';

const CONSUME_LUA = `
local value = redis.call('GET', KEYS[1])
if value then
  redis.call('DEL', KEYS[1])
end
return value
`;

@Injectable()
export class RedisOAuthStateStore implements OAuthStateStore, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async save(state: string, context: OAuthStateContext, ttlMs: number): Promise<void> {
    const key = oauthStateRedisKey(state);
    await this.redis.set(key, JSON.stringify(context), 'PX', ttlMs);
  }

  async consume(state: string): Promise<OAuthStateConsumeResult> {
    const key = oauthStateRedisKey(state);
    const raw = (await this.redis.eval(CONSUME_LUA, 1, key)) as string | null;
    if (!raw) {
      return { ok: false, reason: 'missing' };
    }
    const context = parseContext(raw);
    if (!context || Date.parse(context.expiresAt) <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, context };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

function parseContext(raw: string): OAuthStateContext | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.tenantId !== 'string' ||
      typeof record.workspaceId !== 'string' ||
      typeof record.userId !== 'string' ||
      record.platform !== 'DOUYIN' ||
      typeof record.createdAt !== 'string' ||
      typeof record.expiresAt !== 'string' ||
      !Array.isArray(record.requestedScopes)
    ) {
      return undefined;
    }
    return {
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      userId: record.userId,
      platform: 'DOUYIN',
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      requestedScopes: record.requestedScopes.filter((item): item is string => typeof item === 'string'),
    };
  } catch {
    return undefined;
  }
}

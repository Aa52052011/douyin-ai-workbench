import { usesInMemoryJobQueue } from '../../jobs/queue/redis-config.js';
import { InMemoryOAuthStateStore } from './in-memory-oauth-state.store.js';
import type { OAuthStateStore } from './oauth-state.js';
import { RedisOAuthStateStore } from './redis-oauth-state.store.js';
import { UnavailableOAuthStateStore } from './unavailable-oauth-state.store.js';

export function createOAuthStateStore(): OAuthStateStore {
  if (usesInMemoryJobQueue()) {
    return new InMemoryOAuthStateStore();
  }
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return new UnavailableOAuthStateStore();
  }
  return new RedisOAuthStateStore(url);
}

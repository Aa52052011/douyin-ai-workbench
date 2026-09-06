import { Injectable } from '@nestjs/common';
import type { OAuthStateConsumeResult, OAuthStateContext, OAuthStateStore } from './oauth-state.js';
import { hashOAuthState } from './oauth-state.js';

type StoredState = {
  context: OAuthStateContext;
  expiresAtMs: number;
};

@Injectable()
export class InMemoryOAuthStateStore implements OAuthStateStore {
  private readonly items = new Map<string, StoredState>();

  async save(state: string, context: OAuthStateContext, ttlMs: number): Promise<void> {
    const key = hashOAuthState(state);
    this.items.set(key, {
      context,
      expiresAtMs: Date.now() + ttlMs,
    });
  }

  async consume(state: string): Promise<OAuthStateConsumeResult> {
    const key = hashOAuthState(state);
    const row = this.items.get(key);
    if (!row) {
      return { ok: false, reason: 'missing' };
    }
    this.items.delete(key);
    if (row.expiresAtMs <= Date.now() || Date.parse(row.context.expiresAt) <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, context: row.context };
  }

  size(): number {
    return this.items.size;
  }
}

import { createHash, randomBytes } from 'node:crypto';

export const OAUTH_STATE_STORE = Symbol('OAUTH_STATE_STORE');
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStateContext = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  platform: 'DOUYIN';
  createdAt: string;
  expiresAt: string;
  requestedScopes: string[];
};

export type OAuthStateConsumeResult =
  | { ok: true; context: OAuthStateContext }
  | { ok: false; reason: 'missing' | 'expired' };

export interface OAuthStateStore {
  save(state: string, context: OAuthStateContext, ttlMs: number): Promise<void>;
  consume(state: string): Promise<OAuthStateConsumeResult>;
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export function oauthStateRedisKey(state: string): string {
  return `oauth:douyin:${hashOAuthState(state)}`;
}

export function buildOAuthStateContext(input: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  requestedScopes: string[];
  ttlMs?: number;
  nowMs?: number;
}): OAuthStateContext {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? OAUTH_STATE_TTL_MS;
  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    platform: 'DOUYIN',
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    requestedScopes: input.requestedScopes,
  };
}

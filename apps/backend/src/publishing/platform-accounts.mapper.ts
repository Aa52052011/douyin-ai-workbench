import { Platform, type PlatformAccount } from '@prisma/client';

export type PlatformAccountPublicMetadata = {
  avatarUrl?: string;
};

export type PlatformAccountPublic = {
  id: string;
  platform: string;
  externalAccountId: string;
  displayName: string;
  status: string;
  scopes: string[];
  connectedAt: Date;
  expiresAt: Date | null;
  lastRefreshedAt: Date | null;
  metadata: PlatformAccountPublicMetadata;
};

export function toPublicPlatformAccountDetail(account: PlatformAccount): PlatformAccountPublic {
  return {
    id: account.id,
    platform: account.platform,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
    status: account.status,
    scopes: account.scopes,
    connectedAt: account.connectedAt,
    expiresAt: account.expiresAt,
    lastRefreshedAt: account.lastRefreshedAt,
    metadata: toPublicAccountMetadata(account.metadata),
  };
}

export function toPublicAccountMetadata(metadata: unknown): PlatformAccountPublicMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const avatarUrl = (metadata as Record<string, unknown>).avatarUrl;
  if (typeof avatarUrl === 'string' && avatarUrl.length > 0) {
    return { avatarUrl };
  }
  return {};
}

export function connectedHtml(): string {
  return '<!doctype html><html><body><p>Douyin account connected. You may close this window.</p></body></html>';
}

export function assertPublicAccountHasNoSecrets(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  return [
    '"credentialRef"',
    '"cipher"',
    '"nonce"',
    '"authTag"',
    '"accessToken"',
    '"refreshToken"',
    'client_secret',
    'clientSecret',
    'DOUYIN_CLIENT_SECRET',
  ].filter((key) => text.includes(key));
}

export const DOUYIN_PLATFORM = Platform.DOUYIN;

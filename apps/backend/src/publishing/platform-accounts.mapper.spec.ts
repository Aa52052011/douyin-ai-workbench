import { Platform, PlatformAccountStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  assertPublicAccountHasNoSecrets,
  toPublicPlatformAccountDetail,
} from './platform-accounts.mapper.js';

describe('platform account public mapper', () => {
  it('omits credentialRef, cipher, nonce, authTag and tokens', () => {
    const publicDto = toPublicPlatformAccountDetail({
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 't',
      workspaceId: 'w',
      platform: Platform.DOUYIN,
      externalAccountId: 'open-id-1',
      displayName: 'User',
      status: PlatformAccountStatus.ACTIVE,
      credentialRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopes: ['user_info'],
      metadata: { avatarUrl: 'https://example.com/a.png', accessToken: 'nope' },
      connectedAt: new Date(),
      expiresAt: new Date(),
      lastRefreshedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    expect(publicDto).not.toHaveProperty('credentialRef');
    expect(publicDto.metadata).toEqual({ avatarUrl: 'https://example.com/a.png' });
    expect(assertPublicAccountHasNoSecrets(publicDto)).toEqual([]);
    expect(JSON.stringify(publicDto)).not.toContain('nope');
  });
});

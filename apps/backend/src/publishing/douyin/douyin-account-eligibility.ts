import { grantedScopesIncludePublish } from '../oauth/douyin-oauth.config.js';
import { DouyinProviderError } from './douyin-provider-error.js';
import type { DouyinConnectedAccountStatusV1, DouyinConnectedAccountV1 } from '../providers/douyin-official-open-platform.v1.js';

export type ProviderCapabilityState = 'UNKNOWN' | 'APPROVED' | 'DENIED' | 'PENDING';

export function isPublishingEligible(input: {
  account: DouyinConnectedAccountV1 | null;
  actorTenantId: string;
  actorWorkspaceId: string;
  capability: ProviderCapabilityState;
  credentialDecryptable: boolean;
}): { eligible: boolean; reason?: string } {
  if (!input.account) return { eligible: false, reason: 'ACCOUNT_NOT_CONNECTED' };
  if (input.account.tenantId !== input.actorTenantId || input.account.workspaceId !== input.actorWorkspaceId) {
    return { eligible: false, reason: 'CROSS_TENANT_DENIED' };
  }
  const connected: DouyinConnectedAccountStatusV1[] = ['CONNECTED', 'TOKEN_EXPIRED_REFRESHABLE'];
  if (!connected.includes(input.account.status)) return { eligible: false, reason: 'ACCOUNT_NOT_CONNECTED' };
  if (!grantedScopesIncludePublish(input.account.scope)) return { eligible: false, reason: 'SCOPE_MISSING' };
  if (input.capability !== 'APPROVED') return { eligible: false, reason: 'CAPABILITY_NOT_CONFIRMED' };
  if (!input.credentialDecryptable) return { eligible: false, reason: 'REAUTH_REQUIRED' };
  return { eligible: true };
}

export function assertPublishingEligible(input: Parameters<typeof isPublishingEligible>[0]): void {
  const result = isPublishingEligible(input);
  if (result.eligible) return;
  const code = (result.reason ?? 'ACCOUNT_NOT_CONNECTED') as
    | 'ACCOUNT_NOT_CONNECTED'
    | 'CROSS_TENANT_DENIED'
    | 'SCOPE_MISSING'
    | 'CAPABILITY_NOT_CONFIRMED'
    | 'REAUTH_REQUIRED';
  throw new DouyinProviderError(code);
}

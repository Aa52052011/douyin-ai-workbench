import { DouyinProviderError } from './douyin-provider-error.js';

export type PublicationAuthorizationV1 = {
  authorizationId: string;
  status: 'ACTIVE' | 'REVOKED' | 'STALE' | 'NOT_GRANTED';
  platform: 'DOUYIN';
  accountConnectionId: string;
  artifactId: string;
  artifactSHA256: string;
  captionHash: string;
  coverDecisionHash: string;
  settingsHash: string;
  actionScope: 'UPLOAD_AND_CREATE';
  authorizedAt: string;
};

export type PublicationAuthorizationExpected = {
  artifactId: string;
  artifactSHA256: string;
  accountConnectionId: string;
  captionHash?: string;
  coverDecisionHash?: string;
  settingsHash?: string;
};

export function assertPublicationAuthorizationActive(
  authorization: PublicationAuthorizationV1 | null | undefined,
  expected: PublicationAuthorizationExpected,
): PublicationAuthorizationV1 {
  if (!authorization || authorization.status === 'NOT_GRANTED') {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_MISSING', { message: 'BLOCK_PUBLICATION_ACTION' });
  }
  if (authorization.status !== 'ACTIVE' || authorization.actionScope !== 'UPLOAD_AND_CREATE') {
    throw new DouyinProviderError('BLOCK_PUBLICATION_ACTION');
  }
  if (authorization.platform !== 'DOUYIN') {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_STALE');
  }
  if (
    authorization.artifactId !== expected.artifactId ||
    authorization.artifactSHA256 !== expected.artifactSHA256 ||
    authorization.accountConnectionId !== expected.accountConnectionId
  ) {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_STALE');
  }
  if (expected.captionHash && expected.captionHash !== authorization.captionHash) {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_STALE');
  }
  if (expected.coverDecisionHash && expected.coverDecisionHash !== authorization.coverDecisionHash) {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_STALE');
  }
  if (expected.settingsHash && expected.settingsHash !== authorization.settingsHash) {
    throw new DouyinProviderError('PUBLICATION_AUTHORIZATION_STALE');
  }
  return authorization;
}

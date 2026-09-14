import { createHash } from 'node:crypto';
import { DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND } from '../oauth/douyin-oauth.config.js';
import { ACCEPTED_VERTICAL_SHA_V2 } from '../../production-v2/global-director/publication-acceptance.js';
import { VERTICAL_ARTIFACT_V2_ID } from '../../production-v2/global-director/final-production-v2-authorization.js';

import { evaluateDouyinUploadStrategy, SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES } from '../douyin/douyin-upload-policy.js';
import { DOUYIN_CREATE_VIDEO_PATH, DOUYIN_CREATE_VIDEO_URL, DOUYIN_OAUTH_ACCESS_TOKEN_URL, DOUYIN_OAUTH_AUTHORIZE_PATH, DOUYIN_UPLOAD_VIDEO_PATH, DOUYIN_UPLOAD_VIDEO_URL } from '../douyin/douyin-endpoints.js';
import { parseCreateVideoResponse as parseCreateOfficial, parseUploadVideoResponse as parseUploadOfficial } from '../douyin/douyin-response-parsers.js';
import { redactDouyinSecrets } from '../douyin/douyin-secret-redaction.js';

export const DOUYIN_OFFICIAL_PROVIDER_ID = 'douyin.official-open-platform:v1' as const;
export {
  DOUYIN_CREATE_VIDEO_PATH,
  DOUYIN_CREATE_VIDEO_URL,
  DOUYIN_OAUTH_ACCESS_TOKEN_URL,
  DOUYIN_OAUTH_AUTHORIZE_PATH,
  DOUYIN_UPLOAD_VIDEO_PATH,
  DOUYIN_UPLOAD_VIDEO_URL,
};
export const REQUIRED_PUBLISH_SCOPE = DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND;
/** Historical alias. Not a 128MB hard cap. */
export const SIMPLE_UPLOAD_MAX_BYTES = SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES;
export const CREATE_MAX_RETRIES = 0;
export const UPLOAD_MAX_TRANSIENT_RETRIES = 3;

export const DOUYIN_PUBLISH_ERRORS = [
  'CONFIG_MISSING',
  'ACCOUNT_NOT_CONNECTED',
  'TOKEN_EXPIRED',
  'REAUTH_REQUIRED',
  'SCOPE_MISSING',
  'CAPABILITY_NOT_APPROVED',
  'UPLOAD_REJECTED',
  'FILE_TOO_LARGE',
  'INVALID_VIDEO',
  'CREATE_REJECTED',
  'PLATFORM_REVIEW_REJECTED',
  'RATE_LIMITED',
  'NETWORK_TRANSIENT',
  'UNKNOWN_PROVIDER_ERROR',
  'PUBLICATION_AUTHORIZATION_MISSING',
  'ARTIFACT_ACCEPTANCE_STALE',
  'AMBIGUOUS_CREATE_STATE',
  'LIVE_CALLS_DISABLED',
  'CROSS_TENANT_DENIED',
] as const;
export type DouyinPublishErrorCodeV1 = (typeof DOUYIN_PUBLISH_ERRORS)[number];

export const DOUYIN_PUBLICATION_STATUSES = [
  'NOT_STARTED',
  'UPLOADING',
  'UPLOAD_COMPLETED',
  'CREATE_SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'PUBLISHED',
  'FAILED',
  'REQUIRES_REAUTHORIZATION',
  'BLOCKED_PERMISSION',
] as const;

export type DouyinPublishErrorV1 = {
  code: DouyinPublishErrorCodeV1;
  description?: string;
  logId?: string;
  endpointName?: string;
};

export type DouyinCapabilityEntitlementAuditV1 = {
  capability: 'PUBLISH_ON_BEHALF_OF_USER';
  requiredScope: typeof REQUIRED_PUBLISH_SCOPE;
  applicationStatus: 'UNKNOWN' | 'PENDING' | 'APPROVED' | 'REJECTED';
  entitlementStatus: 'UNKNOWN' | 'NOT_GRANTED' | 'GRANTED';
  verifiedAt?: string;
  source: 'LOCAL_CONFIG_ONLY' | 'OFFICIAL_CONSOLE_CONFIRMED' | 'UNKNOWN';
  humanActionRequired: boolean;
};

export const CURRENT_CAPABILITY_ENTITLEMENT_AUDIT: DouyinCapabilityEntitlementAuditV1 = {
  capability: 'PUBLISH_ON_BEHALF_OF_USER',
  requiredScope: REQUIRED_PUBLISH_SCOPE,
  applicationStatus: 'UNKNOWN',
  entitlementStatus: 'UNKNOWN',
  source: 'LOCAL_CONFIG_ONLY',
  humanActionRequired: true,
};

export type DouyinConnectedAccountStatusV1 =
  | 'CONNECTED'
  | 'TOKEN_EXPIRED_REFRESHABLE'
  | 'REAUTHORIZATION_REQUIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'CONFIG_BLOCKED';

export type DouyinConnectedAccountV1 = {
  accountConnectionId: string;
  tenantId: string;
  workspaceId: string;
  platform: 'DOUYIN';
  openId: string;
  displayName?: string;
  avatar?: string;
  scope: string[];
  accessCredentialRef: string;
  status: DouyinConnectedAccountStatusV1;
  lastAuthorizedAt: string;
  tokenExpiresAt?: string;
  refreshExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DouyinUploadVideoRequestV1 = {
  accountConnectionId: string;
  artifactId: string;
  artifactSHA256: string;
  filePath: string;
  openId: string;
  accessCredentialRef: string;
  contentType: string;
  fileSize: number;
  idempotencyKey: string;
};

export type DouyinCreateVideoRequestV1 = {
  accountConnectionId: string;
  openId: string;
  videoId: string;
  text: string;
  coverTsp?: number;
  customCoverImageId?: string;
  atUsers?: string[];
  publicationAuthorizationId: string;
  idempotencyKey: string;
};

export type DouyinPublicationExecutionV1 = {
  executionId: string;
  authorizationId: string;
  accountConnectionId: string;
  artifactId: string;
  artifactSHA256: string;
  uploadRequestId?: string;
  videoId?: string;
  createRequestId?: string;
  itemId?: string;
  status: (typeof DOUYIN_PUBLICATION_STATUSES)[number];
  platformStatus?: 'SUBMITTED' | 'UNDER_PLATFORM_REVIEW' | 'PUBLISHED' | 'FAILED' | 'UNKNOWN';
  error?: DouyinPublishErrorV1;
  createdAt: string;
  updatedAt: string;
};

export type DouyinProviderReadinessV1 = {
  CODE_IMPLEMENTED: boolean;
  CONFIGURED: boolean;
  CAPABILITY_APPROVED: boolean | 'UNKNOWN';
  ACCOUNT_CONNECTED: boolean;
  SCOPE_VERIFIED: boolean;
  LIVE_UPLOAD_VALIDATED: boolean;
  LIVE_CREATE_VALIDATED: boolean;
};

export const DOUYIN_WEBHOOK_EXTENSION = {
  implemented: false,
  eventsReserved: ['authorization.revoked', 'video.publish.status'],
  liveMonitoring: false,
} as const;

export type DouyinPublicationGateInputV1 = {
  finalVideoAccepted: boolean;
  artifactId: string;
  artifactSha256: string;
  expectedSha256: string;
  accountConnected: boolean;
  tokenValid: boolean;
  requiredScopePresent: boolean;
  capabilityApproved: boolean | 'UNKNOWN';
  providerConfigured: boolean;
  captionApproved: boolean;
  coverDecisionApproved: boolean;
  settingsApproved: boolean;
  truthGatePass: boolean;
  publicationAuthorizationGranted: boolean;
};

export function joinOfficialPath(apiBaseUrl: string, path: string, openId: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  url.searchParams.set('open_id', openId);
  return url.toString();
}

export function buildUploadVideoRequest(input: {
  apiBaseUrl?: string;
  openId: string;
  accessToken: string;
}): { url: string; method: 'POST'; headers: Record<string, string>; contentType: 'multipart/form-data'; bodyField: 'video' } {
  return {
    url: joinOfficialPath(input.apiBaseUrl ?? 'https://open.douyin.com', DOUYIN_UPLOAD_VIDEO_PATH, input.openId),
    method: 'POST',
    headers: { 'access-token': input.accessToken },
    contentType: 'multipart/form-data',
    bodyField: 'video',
  };
}

export function buildCreateVideoRequest(input: {
  apiBaseUrl?: string;
  openId: string;
  accessToken: string;
  videoId: string;
  text: string;
  coverTsp?: number;
}): { url: string; method: 'POST'; headers: Record<string, string>; body: Record<string, unknown> } {
  const body: Record<string, unknown> = { video_id: input.videoId, text: input.text };
  if (typeof input.coverTsp === 'number') body.cover_tsp = input.coverTsp;
  return {
    url: joinOfficialPath(input.apiBaseUrl ?? 'https://open.douyin.com', DOUYIN_CREATE_VIDEO_PATH, input.openId),
    method: 'POST',
    headers: { 'access-token': input.accessToken, 'content-type': 'application/json' },
    body,
  };
}

export function parseUploadVideoResponse(raw: unknown): { videoId: string | null; width: number | null; height: number | null; errorCode: number | null; description: string | null } {
  const parsed = parseUploadOfficial(raw);
  return {
    videoId: parsed.videoId,
    width: parsed.width,
    height: parsed.height,
    errorCode: parsed.errorCode,
    description: parsed.description,
  };
}

export function parseCreateVideoResponse(raw: unknown): {
  itemId: string | null;
  videoId: string | null;
  errorCode: number | null;
  description: string | null;
  reviewStatus: 'SUBMITTED' | 'UNDER_PLATFORM_REVIEW' | 'PUBLISHED' | 'FAILED' | 'UNKNOWN';
} {
  const parsed = parseCreateOfficial(raw);
  return {
    itemId: parsed.itemId,
    videoId: parsed.videoId,
    errorCode: parsed.errorCode,
    description: parsed.description,
    reviewStatus: parsed.errorCode && parsed.errorCode !== 0 ? 'FAILED' : parsed.itemId ? 'UNDER_PLATFORM_REVIEW' : 'SUBMITTED',
  };
}

export function uploadStrategyForBytes(bytes: number): 'SIMPLE_UPLOAD' | 'CHUNKED_UPLOAD_REQUIRED' {
  const policy = evaluateDouyinUploadStrategy(bytes);
  if (policy.selectedStrategy === 'CHUNKED_UPLOAD_REQUIRED' || policy.selectedStrategy === 'FILE_TOO_LARGE') {
    return 'CHUNKED_UPLOAD_REQUIRED';
  }
  return 'SIMPLE_UPLOAD';
}

export function assertAcceptedArtifactSha(actual: string, expected = ACCEPTED_VERTICAL_SHA_V2): void {
  if (actual !== expected) throw new Error('ACCEPTANCE_STALE');
}

export function assertPublicationAuthorization(granted: boolean): void {
  if (!granted) throw new Error('PUBLICATION_AUTHORIZATION_MISSING');
}

export function assertSameTenantWorkspace(input: { accountTenantId: string; accountWorkspaceId: string; actorTenantId: string; actorWorkspaceId: string }): void {
  if (input.accountTenantId !== input.actorTenantId || input.accountWorkspaceId !== input.actorWorkspaceId) {
    throw new Error('CROSS_TENANT_DENIED');
  }
}

export function classifyCreateTimeout(): 'AMBIGUOUS_CREATE_STATE' {
  return 'AMBIGUOUS_CREATE_STATE';
}

export function mayBlindRetryCreate(state: 'UNKNOWN' | 'TIMEOUT' | 'FAILED_CONFIRMED'): boolean {
  return state === 'FAILED_CONFIRMED';
}

export function redactSecrets(text: string): string {
  return redactDouyinSecrets(text);
}

export function oauthStateRequired(state: string | undefined): boolean {
  return Boolean(state && state.length >= 16);
}

export function evaluateDouyinPublicationGate(input: DouyinPublicationGateInputV1): {
  status: 'READY_TO_PUBLISH' | 'NOT_READY';
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!input.finalVideoAccepted) blockers.push('FINAL_VIDEO_NOT_ACCEPTED');
  if (input.artifactSha256 !== input.expectedSha256) blockers.push('ARTIFACT_SHA_MISMATCH');
  if (input.artifactId !== VERTICAL_ARTIFACT_V2_ID && input.artifactId.length === 0) blockers.push('ARTIFACT_ID_MISSING');
  if (!input.accountConnected) blockers.push('ACCOUNT_NOT_CONNECTED');
  if (!input.tokenValid) blockers.push('TOKEN_INVALID');
  if (!input.requiredScopePresent) blockers.push('SCOPE_MISSING');
  if (input.capabilityApproved !== true) blockers.push('CAPABILITY_NOT_APPROVED');
  if (!input.providerConfigured) blockers.push('PROVIDER_NOT_CONFIGURED');
  if (!input.captionApproved) blockers.push('CAPTION_NOT_APPROVED');
  if (!input.coverDecisionApproved) blockers.push('COVER_NOT_APPROVED');
  if (!input.settingsApproved) blockers.push('SETTINGS_NOT_APPROVED');
  if (!input.truthGatePass) blockers.push('TRUTH_GATE');
  if (!input.publicationAuthorizationGranted) blockers.push('PUBLICATION_AUTHORIZATION_NOT_GRANTED');
  return { status: blockers.length === 0 ? 'READY_TO_PUBLISH' : 'NOT_READY', blockers };
}

export function currentContent01PublicationGate(): ReturnType<typeof evaluateDouyinPublicationGate> {
  return evaluateDouyinPublicationGate({
    finalVideoAccepted: true,
    artifactId: VERTICAL_ARTIFACT_V2_ID,
    artifactSha256: ACCEPTED_VERTICAL_SHA_V2,
    expectedSha256: ACCEPTED_VERTICAL_SHA_V2,
    accountConnected: false,
    tokenValid: false,
    requiredScopePresent: false,
    capabilityApproved: 'UNKNOWN',
    providerConfigured: false,
    captionApproved: false,
    coverDecisionApproved: false,
    settingsApproved: false,
    truthGatePass: true,
    publicationAuthorizationGranted: false,
  });
}

export function liveDouyinCallForbidden(): never {
  throw new Error('LIVE_CALLS_DISABLED');
}

export function executionIdempotencyKey(input: { authorizationId: string; artifactSha256: string; accountConnectionId: string }): string {
  return createHash('sha256').update(`${input.authorizationId}:${input.artifactSha256}:${input.accountConnectionId}`).digest('hex');
}

export type DouyinOfficialPublishingProviderV1 = {
  providerId: typeof DOUYIN_OFFICIAL_PROVIDER_ID;
  getCapabilities(): {
    uploadVideo: true;
    createVideo: true;
    schedule: false;
    liveCalls: false;
    requiredScope: typeof REQUIRED_PUBLISH_SCOPE;
    uploadModes: ['SIMPLE_UPLOAD', 'CHUNKED_UPLOAD'];
  };
  validateConfig(): { ok: boolean };
  validateAccount(): { ok: false; reason: 'NO_LIVE_CALLS_THIS_STEP' };
  uploadVideo(): never;
  createVideo(): never;
  getPublishStatus?(): never;
  refreshCredentials?(): never;
};

export function douyinOfficialPublishingProviderContract(): DouyinOfficialPublishingProviderV1 {
  return {
    providerId: DOUYIN_OFFICIAL_PROVIDER_ID,
    getCapabilities: () => ({
      uploadVideo: true,
      createVideo: true,
      schedule: false,
      liveCalls: false,
      requiredScope: REQUIRED_PUBLISH_SCOPE,
      uploadModes: ['SIMPLE_UPLOAD', 'CHUNKED_UPLOAD'],
    }),
    validateConfig: () => ({ ok: false }),
    validateAccount: () => ({ ok: false, reason: 'NO_LIVE_CALLS_THIS_STEP' }),
    uploadVideo: () => liveDouyinCallForbidden(),
    createVideo: () => liveDouyinCallForbidden(),
  };
}

export type PublishingProvider = DouyinOfficialPublishingProviderV1;

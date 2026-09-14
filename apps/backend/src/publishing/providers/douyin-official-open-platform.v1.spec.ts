import { describe, expect, it } from 'vitest';
import { DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND, DOUYIN_OAUTH_SCOPE_USER_INFO } from '../oauth/douyin-oauth.config.js';
import { ACCEPTED_VERTICAL_SHA_V2 } from '../../production-v2/global-director/publication-acceptance.js';
import {
  CREATE_MAX_RETRIES,
  DOUYIN_CREATE_VIDEO_URL,
  DOUYIN_OFFICIAL_PROVIDER_ID,
  DOUYIN_UPLOAD_VIDEO_URL,
  REQUIRED_PUBLISH_SCOPE,
  assertAcceptedArtifactSha,
  assertPublicationAuthorization,
  assertSameTenantWorkspace,
  buildCreateVideoRequest,
  buildUploadVideoRequest,
  classifyCreateTimeout,
  CURRENT_CAPABILITY_ENTITLEMENT_AUDIT,
  currentContent01PublicationGate,
  douyinOfficialPublishingProviderContract,
  executionIdempotencyKey,
  liveDouyinCallForbidden,
  mayBlindRetryCreate,
  oauthStateRequired,
  parseCreateVideoResponse,
  parseUploadVideoResponse,
  redactSecrets,
  uploadStrategyForBytes,
} from './douyin-official-open-platform.v1.js';

describe('Douyin official open-platform publish contracts', () => {
  it('models official upload/create endpoints, scope, and separated stages', () => {
    expect(DOUYIN_UPLOAD_VIDEO_URL).toBe('https://open.douyin.com/api/douyin/v1/video/upload_video/');
    expect(DOUYIN_CREATE_VIDEO_URL).toBe('https://open.douyin.com/api/douyin/v1/video/create_video/');
    expect(REQUIRED_PUBLISH_SCOPE).toBe('video.create.bind');
    expect(CURRENT_CAPABILITY_ENTITLEMENT_AUDIT.entitlementStatus).toBe('UNKNOWN');
    expect(CURRENT_CAPABILITY_ENTITLEMENT_AUDIT.humanActionRequired).toBe(true);
    expect(DOUYIN_OAUTH_SCOPE_VIDEO_CREATE_BIND).toBe('video.create.bind');
    expect(DOUYIN_OAUTH_SCOPE_USER_INFO).toBe('user_info');
    const upload = buildUploadVideoRequest({ openId: 'oid', accessToken: 'tok' });
    expect(upload.url).toContain('/api/douyin/v1/video/upload_video/');
    expect(upload.url).toContain('open_id=oid');
    expect(upload.headers['access-token']).toBe('tok');
    expect(upload.bodyField).toBe('video');
    const create = buildCreateVideoRequest({ openId: 'oid', accessToken: 'tok', videoId: 'vid-enc', text: 'hello' });
    expect(create.url).toContain('/api/douyin/v1/video/create_video/');
    expect(create.body.video_id).toBe('vid-enc');
    expect(create.body.text).toBe('hello');
    const parsedUpload = parseUploadVideoResponse({ data: { video_id: 'enc-1', width: 1080, height: 1920, error_code: 0 } });
    const parsedCreate = parseCreateVideoResponse({ error_code: 0, data: { item_id: 'item-9', video_id: 'enc-1' } });
    expect(parsedUpload.videoId).toBe('enc-1');
    expect(parsedCreate.itemId).toBe('item-9');
    expect(parsedCreate.videoId).not.toBe(parsedCreate.itemId);
    expect(parsedCreate.reviewStatus).toBe('UNDER_PLATFORM_REVIEW');
  });

  it('enforces oauth state, secret redaction, tenant isolation, sha and publication auth', () => {
    expect(oauthStateRequired(undefined)).toBe(false);
    expect(oauthStateRequired('short')).toBe(false);
    expect(oauthStateRequired('a'.repeat(16))).toBe(true);
    expect(redactSecrets('access_token=abc client_secret=xyz')).not.toMatch(/abc|xyz/);
    expect(() =>
      assertSameTenantWorkspace({
        accountTenantId: 't1',
        accountWorkspaceId: 'w1',
        actorTenantId: 't2',
        actorWorkspaceId: 'w1',
      }),
    ).toThrow(/CROSS_TENANT/);
    expect(() => assertAcceptedArtifactSha('dead')).toThrow(/ACCEPTANCE_STALE/);
    expect(() => assertAcceptedArtifactSha(ACCEPTED_VERTICAL_SHA_V2)).not.toThrow();
    expect(() => assertPublicationAuthorization(false)).toThrow(/PUBLICATION_AUTHORIZATION_MISSING/);
    expect(classifyCreateTimeout()).toBe('AMBIGUOUS_CREATE_STATE');
    expect(mayBlindRetryCreate('TIMEOUT')).toBe(false);
    expect(CREATE_MAX_RETRIES).toBe(0);
    expect(executionIdempotencyKey({ authorizationId: 'a', artifactSha256: 'b', accountConnectionId: 'c' })).toHaveLength(64);
    expect(uploadStrategyForBytes(4_000_000)).toBe('SIMPLE_UPLOAD');
    const provider = douyinOfficialPublishingProviderContract();
    expect(provider.providerId).toBe(DOUYIN_OFFICIAL_PROVIDER_ID);
    expect(provider.getCapabilities().liveCalls).toBe(false);
    expect(() => liveDouyinCallForbidden()).toThrow(/LIVE_CALLS_DISABLED/);
    expect(() => provider.uploadVideo()).toThrow(/LIVE_CALLS_DISABLED/);
    expect(() => provider.createVideo()).toThrow(/LIVE_CALLS_DISABLED/);
    const gate = currentContent01PublicationGate();
    expect(gate.status).toBe('NOT_READY');
    expect(gate.blockers).toContain('PUBLICATION_AUTHORIZATION_NOT_GRANTED');
    expect(gate.blockers).toContain('ACCOUNT_NOT_CONNECTED');
  });
});

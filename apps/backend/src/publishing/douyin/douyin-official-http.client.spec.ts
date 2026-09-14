import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCEPTED_VERTICAL_SHA_V2 } from '../../production-v2/global-director/publication-acceptance.js';
import { VERTICAL_ARTIFACT_V2_ID } from '../../production-v2/global-director/final-production-v2-authorization.js';
import { evaluateGrantedScopes, formatDouyinScopeParam, scopesForOAuthPurpose } from '../oauth/douyin-oauth.config.js';
import { DouyinProviderError } from './douyin-provider-error.js';
import { CREATE_MAX_RETRIES } from './douyin-create.client.js';
import { DOUYIN_CREATE_VIDEO_PATH, DOUYIN_UPLOAD_VIDEO_PATH } from './douyin-endpoints.js';
import { FakeDouyinHttpTransport, RealDouyinHttpTransport, safeLogSnapshot } from './douyin-http.transport.js';
import { InMemoryPublicationExecutionStore, assertTransition, executionUniquenessKey } from './douyin-publication-state-machine.js';
import { DouyinPublishingProviderV1 } from './douyin-publishing.provider.js';
import { parseCreateVideoResponse, parseUploadVideoResponse, requireCreateSuccess, requireUploadSuccess } from './douyin-response-parsers.js';
import { redactDouyinSecrets, DOUYIN_REDACTED_TOKEN } from './douyin-secret-redaction.js';
import { CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES, SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES, evaluateDouyinUploadStrategy, MAX_TOTAL_VIDEO_BYTES } from './douyin-upload-policy.js';
import { DouyinUploadVideoClientV1, UPLOAD_MAX_TRANSIENT_RETRIES } from './douyin-upload.client.js';
import type { DouyinConnectedAccountV1 } from '../providers/douyin-official-open-platform.v1.js';
import type { PublicationAuthorizationV1 } from './douyin-publication-authorization.js';
import type { DouyinUploadClientContext } from './douyin-upload.client.js';
import type { DouyinCreateClientContext } from './douyin-create.client.js';

const SYNTHETIC_TOKEN = 'synthetic-access-token-test-only';
const TENANT = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
const WORKSPACE = '01a08b24-3e55-7022-82c1-7bfa494e755b';

function tempVideo(bytes = Buffer.from('fake-mp4-bytes')): { filePath: string; sha: string; size: number } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'acf-o6-'));
  const filePath = path.join(dir, 'clip.mp4');
  writeFileSync(filePath, bytes);
  return { filePath, sha: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

function account(overrides: Partial<DouyinConnectedAccountV1> = {}): DouyinConnectedAccountV1 {
  return {
    accountConnectionId: 'acct-1',
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    platform: 'DOUYIN',
    openId: 'oid-1',
    scope: ['user_info', 'video.create.bind'],
    accessCredentialRef: 'secret-ref',
    status: 'CONNECTED',
    lastAuthorizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function authorization(sha: string): PublicationAuthorizationV1 {
  return {
    authorizationId: 'auth-1',
    status: 'ACTIVE',
    platform: 'DOUYIN',
    accountConnectionId: 'acct-1',
    artifactId: VERTICAL_ARTIFACT_V2_ID,
    artifactSHA256: sha,
    captionHash: 'cap',
    coverDecisionHash: 'cov',
    settingsHash: 'set',
    actionScope: 'UPLOAD_AND_CREATE',
    authorizedAt: new Date().toISOString(),
  };
}

function uploadCtx(sha: string, extra: Partial<DouyinUploadClientContext> = {}): DouyinUploadClientContext {
  return {
    actorTenantId: TENANT,
    actorWorkspaceId: WORKSPACE,
    account: account(),
    authorization: authorization(sha),
    capability: 'APPROVED',
    credentialDecryptable: true,
    liveEnabled: true,
    accessToken: SYNTHETIC_TOKEN,
    expectedSha256: sha,
    retryDelayMs: 0,
    ...extra,
  };
}

function createCtx(extra: Partial<DouyinCreateClientContext> = {}): DouyinCreateClientContext {
  return {
    actorTenantId: TENANT,
    actorWorkspaceId: WORKSPACE,
    account: account(),
    authorization: authorization('x'),
    capability: 'APPROVED',
    credentialDecryptable: true,
    liveEnabled: true,
    accessToken: SYNTHETIC_TOKEN,
    captionApproved: true,
    coverDecisionApproved: true,
    settingsApproved: true,
    truthGatePass: true,
    ...extra,
  };
}

const uploadOk = {
  extra: { error_code: 0, description: 'ok', logid: 'log-u' },
  data: { error_code: 0, video: { video_id: 'enc-video-1', width: 1080, height: 1920 } },
};

describe('Douyin official HTTP clients', () => {
  it('builds upload multipart with video field, open_id, access-token', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const store = new InMemoryPublicationExecutionStore();
    const client = new DouyinUploadVideoClientV1(transport, store);
    const result = await client.uploadVideo(
      {
        accountConnectionId: 'acct-1',
        artifactId: VERTICAL_ARTIFACT_V2_ID,
        artifactSHA256: file.sha,
        filePath: file.filePath,
        openId: 'oid-1',
        accessCredentialRef: 'secret-ref',
        contentType: 'video/mp4',
        fileSize: file.size,
        idempotencyKey: 'exec-1',
      },
      uploadCtx(file.sha),
    );
    expect(result.response.status).toBe('UPLOAD_COMPLETED');
    expect(result.response.videoId).toBe('enc-video-1');
    const call = transport.calls[0];
    expect(call.request.path).toBe(DOUYIN_UPLOAD_VIDEO_PATH);
    expect(call.request.query?.open_id).toBe('oid-1');
    expect(call.request.headers?.['access-token']).toBe(SYNTHETIC_TOKEN);
    expect(call.multipart?.fieldName).toBe('video');
    expect(call.multipart?.contentType).toBe('video/mp4');
  });

  it('builds create JSON with video_id, text, cover_tsp', async () => {
    const transport = new FakeDouyinHttpTransport([
      { kind: 'json', status: 200, json: uploadOk },
      { kind: 'json', status: 200, json: { extra: { error_code: 0, logid: 'log-c' }, data: { item_id: 'item-9', video_id: 'enc-video-1' } } },
    ]);
    const provider = new DouyinPublishingProviderV1(transport);
    const file = tempVideo();
    await provider.uploadVideo(
      {
        accountConnectionId: 'acct-1',
        artifactId: VERTICAL_ARTIFACT_V2_ID,
        artifactSHA256: file.sha,
        filePath: file.filePath,
        openId: 'oid-1',
        accessCredentialRef: 'secret-ref',
        contentType: 'video/mp4',
        fileSize: file.size,
        idempotencyKey: 'exec-2',
      },
      uploadCtx(file.sha),
    );
    const created = await provider.createVideo(
      {
        accountConnectionId: 'acct-1',
        openId: 'oid-1',
        videoId: 'enc-video-1',
        text: 'caption text',
        coverTsp: 1.5,
        publicationAuthorizationId: 'auth-1',
        idempotencyKey: 'exec-2',
      },
      createCtx({ authorization: authorization(file.sha) }),
    );
    expect(created.response.status).toBe('UNDER_PLATFORM_REVIEW');
    expect(created.response.platformItemId).toBe('item-9');
    expect(created.response.uploadVideoId).toBe('enc-video-1');
    expect(created.response.platformItemId).not.toBe(created.response.uploadVideoId);
    const createCall = transport.calls[1];
    expect(createCall.request.path).toBe(DOUYIN_CREATE_VIDEO_PATH);
    expect(createCall.jsonBody?.video_id).toBe('enc-video-1');
    expect(createCall.jsonBody?.text).toBe('caption text');
    expect(createCall.jsonBody?.cover_tsp).toBe(1.5);
  });

  it('uses 50MB recommendation and 300MB mandatory chunk, not 128MB', () => {
    expect(SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES).toBe(300 * 1024 * 1024);
    expect(MAX_TOTAL_VIDEO_BYTES).toBe(4 * 1024 * 1024 * 1024);
    expect(evaluateDouyinUploadStrategy(4_246_350).selectedStrategy).toBe('SIMPLE_UPLOAD');
    expect(evaluateDouyinUploadStrategy(4_246_350).reason).toBe('FILE_WELL_BELOW_50MB_RECOMMENDATION_THRESHOLD');
    expect(evaluateDouyinUploadStrategy(60 * 1024 * 1024).selectedStrategy).toBe('CHUNK_RECOMMENDED');
    expect(evaluateDouyinUploadStrategy(301 * 1024 * 1024).selectedStrategy).toBe('CHUNKED_UPLOAD_REQUIRED');
  });

  it('blocks real transport side effects when live is disabled', async () => {
    let fetched = 0;
    const transport = new RealDouyinHttpTransport(async () => {
      fetched += 1;
      throw new Error('network should not run');
    }, false);
    await expect(transport.sendJson({ method: 'POST', path: DOUYIN_CREATE_VIDEO_PATH, timeoutMs: 1000, requestId: 'r', endpointName: 'create_video' }, {})).rejects.toMatchObject({ code: 'LIVE_CALLS_DISABLED' });
    await expect(transport.sendMultipart({ method: 'POST', path: DOUYIN_UPLOAD_VIDEO_PATH, timeoutMs: 1000, requestId: 'r', endpointName: 'upload_video' }, { fieldName: 'video', filename: 'a.mp4', contentType: 'video/mp4', bytes: new Uint8Array([1]) })).rejects.toMatchObject({ code: 'LIVE_CALLS_DISABLED' });
    expect(fetched).toBe(0);
  });

  it('requires publication authorization, account, scope, capability before HTTP', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const client = new DouyinUploadVideoClientV1(transport, new InMemoryPublicationExecutionStore());
    const req = {
      accountConnectionId: 'acct-1',
      artifactId: VERTICAL_ARTIFACT_V2_ID,
      artifactSHA256: file.sha,
      filePath: file.filePath,
      openId: 'oid-1',
      accessCredentialRef: 'secret-ref',
      contentType: 'video/mp4',
      fileSize: file.size,
      idempotencyKey: 'g1',
    };
    await expect(client.uploadVideo(req, uploadCtx(file.sha, { liveEnabled: false }))).rejects.toMatchObject({ code: 'LIVE_CALLS_DISABLED' });
    await expect(client.uploadVideo(req, uploadCtx(file.sha, { authorization: null }))).rejects.toMatchObject({ code: 'PUBLICATION_AUTHORIZATION_MISSING' });
    await expect(client.uploadVideo(req, uploadCtx(file.sha, { account: null }))).rejects.toMatchObject({ code: 'ACCOUNT_NOT_CONNECTED' });
    await expect(client.uploadVideo(req, uploadCtx(file.sha, { account: account({ scope: ['user_info'] }) }))).rejects.toMatchObject({ code: 'SCOPE_MISSING' });
    await expect(client.uploadVideo(req, uploadCtx(file.sha, { capability: 'UNKNOWN' }))).rejects.toMatchObject({ code: 'CAPABILITY_NOT_CONFIRMED' });
    expect(transport.calls).toHaveLength(0);
  });

  it('blocks SHA mismatch without HTTP and matches live bytes hash', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const client = new DouyinUploadVideoClientV1(transport, new InMemoryPublicationExecutionStore());
    await expect(
      client.uploadVideo(
        {
          accountConnectionId: 'acct-1',
          artifactId: VERTICAL_ARTIFACT_V2_ID,
          artifactSHA256: ACCEPTED_VERTICAL_SHA_V2,
          filePath: file.filePath,
          openId: 'oid-1',
          accessCredentialRef: 'secret-ref',
          contentType: 'video/mp4',
          fileSize: file.size,
          idempotencyKey: 'sha1',
        },
        uploadCtx(ACCEPTED_VERTICAL_SHA_V2),
      ),
    ).rejects.toMatchObject({ code: 'ARTIFACT_ACCEPTANCE_STALE' });
    expect(transport.calls).toHaveLength(0);
  });

  it('retries transient upload failures then completes', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([
      { kind: 'json', status: 500, json: {} },
      { kind: 'network', message: 'reset' },
      { kind: 'json', status: 200, json: uploadOk },
    ]);
    const client = new DouyinUploadVideoClientV1(transport, new InMemoryPublicationExecutionStore());
    const result = await client.uploadVideo(
      {
        accountConnectionId: 'acct-1',
        artifactId: VERTICAL_ARTIFACT_V2_ID,
        artifactSHA256: file.sha,
        filePath: file.filePath,
        openId: 'oid-1',
        accessCredentialRef: 'secret-ref',
        contentType: 'video/mp4',
        fileSize: file.size,
        idempotencyKey: 'retry-1',
      },
      uploadCtx(file.sha),
    );
    expect(result.attempts).toBe(3);
    expect(result.response.status).toBe('UPLOAD_COMPLETED');
    expect(UPLOAD_MAX_TRANSIENT_RETRIES).toBe(3);
  });

  it('does not retry SCOPE_MISSING', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const client = new DouyinUploadVideoClientV1(transport, new InMemoryPublicationExecutionStore());
    await expect(
      client.uploadVideo(
        {
          accountConnectionId: 'acct-1',
          artifactId: VERTICAL_ARTIFACT_V2_ID,
          artifactSHA256: file.sha,
          filePath: file.filePath,
          openId: 'oid-1',
          accessCredentialRef: 'secret-ref',
          contentType: 'video/mp4',
          fileSize: file.size,
          idempotencyKey: 'scope-1',
        },
        uploadCtx(file.sha, { account: account({ scope: ['user_info'] }) }),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE_MISSING' });
    expect(transport.calls).toHaveLength(0);
  });

  it('maps create timeout to AMBIGUOUS_CREATE_STATE with zero retries', async () => {
    const transport = new FakeDouyinHttpTransport([
      { kind: 'json', status: 200, json: uploadOk },
      { kind: 'timeout' },
    ]);
    const provider = new DouyinPublishingProviderV1(transport);
    const file = tempVideo();
    await provider.uploadVideo(
      {
        accountConnectionId: 'acct-1',
        artifactId: VERTICAL_ARTIFACT_V2_ID,
        artifactSHA256: file.sha,
        filePath: file.filePath,
        openId: 'oid-1',
        accessCredentialRef: 'secret-ref',
        contentType: 'video/mp4',
        fileSize: file.size,
        idempotencyKey: 'amb-1',
      },
      uploadCtx(file.sha),
    );
    await expect(
      provider.createVideo(
        {
          accountConnectionId: 'acct-1',
          openId: 'oid-1',
          videoId: 'enc-video-1',
          text: 't',
          publicationAuthorizationId: 'auth-1',
          idempotencyKey: 'amb-1',
        },
        createCtx({ authorization: authorization(file.sha) }),
      ),
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_CREATE_STATE' });
    expect(provider.executions.get('amb-1')?.status).toBe('AMBIGUOUS_CREATE_STATE');
    expect(CREATE_MAX_RETRIES).toBe(0);
    expect(transport.calls.filter((c) => c.request.endpointName === 'create_video')).toHaveLength(1);
  });

  it('prevents duplicate upload and duplicate create', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([
      { kind: 'json', status: 200, json: uploadOk },
      { kind: 'json', status: 200, json: { data: { item_id: 'item-1' } } },
      { kind: 'json', status: 200, json: uploadOk },
    ]);
    const provider = new DouyinPublishingProviderV1(transport);
    const req = {
      accountConnectionId: 'acct-1',
      artifactId: VERTICAL_ARTIFACT_V2_ID,
      artifactSHA256: file.sha,
      filePath: file.filePath,
      openId: 'oid-1',
      accessCredentialRef: 'secret-ref',
      contentType: 'video/mp4',
      fileSize: file.size,
      idempotencyKey: 'dup-1',
    };
    const first = await provider.uploadVideo(req, uploadCtx(file.sha));
    const second = await provider.uploadVideo(req, uploadCtx(file.sha));
    expect(second.attempts).toBe(0);
    expect(second.response.videoId).toBe(first.response.videoId);
    await provider.createVideo(
      {
        accountConnectionId: 'acct-1',
        openId: 'oid-1',
        videoId: 'enc-video-1',
        text: 't',
        publicationAuthorizationId: 'auth-1',
        idempotencyKey: 'dup-1',
      },
      createCtx({ authorization: authorization(file.sha) }),
    );
    await expect(
      provider.createVideo(
        {
          accountConnectionId: 'acct-1',
          openId: 'oid-1',
          videoId: 'enc-video-1',
          text: 't',
          publicationAuthorizationId: 'auth-1',
          idempotencyKey: 'dup-1',
        },
        createCtx({ authorization: authorization(file.sha) }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CREATE_FORBIDDEN' });
  });

  it('rejects invalid state transitions and create without upload', () => {
    expect(() => assertTransition('READY', 'CREATE_SUBMITTED')).toThrow(DouyinProviderError);
    expect(() => assertTransition('UPLOAD_FAILED', 'PUBLISHED')).toThrow(DouyinProviderError);
    expect(() => assertTransition('AMBIGUOUS_CREATE_STATE', 'CREATE_SUBMITTING')).toThrow(DouyinProviderError);
    expect(executionUniquenessKey({ accountConnectionId: 'a', artifactSHA256: 'b', publicationAuthorizationId: 'c' })).toContain('DOUYIN');
  });

  it('redacts tokens, secrets and oauth codes', () => {
    const snapshot = safeLogSnapshot({
      method: 'POST',
      endpointName: 'upload_video',
      requestId: randomUUID(),
      headers: { 'access-token': SYNTHETIC_TOKEN },
    });
    expect(JSON.stringify(snapshot)).not.toContain(SYNTHETIC_TOKEN);
    expect(JSON.stringify(snapshot)).toContain(DOUYIN_REDACTED_TOKEN);
    expect(redactDouyinSecrets(`access_token=${SYNTHETIC_TOKEN} client_secret=abc code=xyz`)).not.toMatch(/synthetic-access|abc|xyz/);
  });

  it('parses success, provider error, malformed, missing video_id', () => {
    expect(requireUploadSuccess(uploadOk).videoId).toBe('enc-video-1');
    expect(parseUploadVideoResponse({ data: {} }).videoId).toBeNull();
    expect(() => requireUploadSuccess({ data: {} })).toThrow();
    expect(parseCreateVideoResponse({ data: { item_id: 'i' } }).itemId).toBe('i');
    const submitted = requireCreateSuccess({ extra: { error_code: 0 } }, 'enc-video-1');
    expect(submitted.status).toBe('CREATE_SUBMITTED');
    expect(submitted.platformItemId).toBeNull();
  });

  it('models oauth login vs publishing scopes and granted-scope validation', () => {
    expect(formatDouyinScopeParam(scopesForOAuthPurpose('LOGIN_ONLY'))).toBe('user_info');
    expect(formatDouyinScopeParam(scopesForOAuthPurpose('PUBLISHING'))).toBe('user_info,video.create.bind');
    expect(evaluateGrantedScopes({ purpose: 'PUBLISHING', granted: ['user_info'] }).missing).toContain('video.create.bind');
  });

  it('isolates tenants and blocks metadata-unapproved create', async () => {
    const file = tempVideo();
    const transport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const provider = new DouyinPublishingProviderV1(transport);
    await expect(
      provider.uploadVideo(
        {
          accountConnectionId: 'acct-1',
          artifactId: VERTICAL_ARTIFACT_V2_ID,
          artifactSHA256: file.sha,
          filePath: file.filePath,
          openId: 'oid-1',
          accessCredentialRef: 'secret-ref',
          contentType: 'video/mp4',
          fileSize: file.size,
          idempotencyKey: 'ten-1',
        },
        uploadCtx(file.sha, { actorTenantId: 'other-tenant' }),
      ),
    ).rejects.toMatchObject({ code: 'CROSS_TENANT_DENIED' });
    const createTransport = new FakeDouyinHttpTransport([{ kind: 'json', status: 200, json: uploadOk }]);
    const createProvider = new DouyinPublishingProviderV1(createTransport);
    await createProvider.uploadVideo(
      {
        accountConnectionId: 'acct-1',
        artifactId: VERTICAL_ARTIFACT_V2_ID,
        artifactSHA256: file.sha,
        filePath: file.filePath,
        openId: 'oid-1',
        accessCredentialRef: 'secret-ref',
        contentType: 'video/mp4',
        fileSize: file.size,
        idempotencyKey: 'meta-1',
      },
      uploadCtx(file.sha),
    );
    await expect(
      createProvider.createVideo(
        {
          accountConnectionId: 'acct-1',
          openId: 'oid-1',
          videoId: 'enc-video-1',
          text: 'draft',
          publicationAuthorizationId: 'auth-1',
          idempotencyKey: 'meta-1',
        },
        createCtx({ authorization: authorization(file.sha), captionApproved: false, coverDecisionApproved: false, settingsApproved: false }),
      ),
    ).rejects.toMatchObject({ code: 'BLOCKED_HUMAN_METADATA_APPROVAL' });
  });

  it('does not call open.douyin.com from fake transport', () => {
    const fake = new FakeDouyinHttpTransport();
    expect(fake.calls.every((call) => !call.request.path.includes('https://open.douyin.com'))).toBe(true);
  });
});

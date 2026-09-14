import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ACCEPTED_VERTICAL_SHA_V2 } from '../../production-v2/global-director/publication-acceptance.js';
import type { DouyinUploadVideoRequestV1 } from '../providers/douyin-official-open-platform.v1.js';
import { DouyinProviderError } from './douyin-provider-error.js';
import { DOUYIN_UPLOAD_VIDEO_PATH } from './douyin-endpoints.js';
import type { DouyinHttpTransport } from './douyin-http.transport.js';
import { assertPublicationAuthorizationActive, type PublicationAuthorizationV1 } from './douyin-publication-authorization.js';
import { requireUploadSuccess, mapHttpError, type DouyinUploadVideoResponseV1 } from './douyin-response-parsers.js';
import { DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS } from './douyin-runtime-config.js';
import { evaluateDouyinUploadStrategy } from './douyin-upload-policy.js';
import { assertPublishingEligible, type ProviderCapabilityState } from './douyin-account-eligibility.js';
import type { DouyinConnectedAccountV1 } from '../providers/douyin-official-open-platform.v1.js';
import { assertSameTenantWorkspace } from '../providers/douyin-official-open-platform.v1.js';
import {
  assertTransition,
  type DouyinPublicationExecutionRecord,
  type InMemoryPublicationExecutionStore,
} from './douyin-publication-state-machine.js';

export const UPLOAD_MAX_TRANSIENT_RETRIES = 3;
export const NON_RETRYABLE_UPLOAD = new Set([
  'SCOPE_MISSING',
  'CAPABILITY_NOT_APPROVED',
  'CAPABILITY_NOT_CONFIRMED',
  'ACCOUNT_NOT_CONNECTED',
  'AUTH_INVALID',
  'TOKEN_EXPIRED',
  'REAUTH_REQUIRED',
  'FILE_INVALID',
  'SHA_MISMATCH',
  'ARTIFACT_ACCEPTANCE_STALE',
  'PERMISSION_DENIED',
  'PUBLICATION_AUTHORIZATION_MISSING',
  'BLOCK_PUBLICATION_ACTION',
  'LIVE_CALLS_DISABLED',
  'CROSS_TENANT_DENIED',
]);

export type DouyinUploadClientContext = {
  actorTenantId: string;
  actorWorkspaceId: string;
  account: DouyinConnectedAccountV1 | null;
  authorization: PublicationAuthorizationV1 | null;
  capability: ProviderCapabilityState;
  credentialDecryptable: boolean;
  liveEnabled: boolean;
  accessToken: string;
  expectedSha256?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export class DouyinUploadVideoClientV1 {
  constructor(
    private readonly transport: DouyinHttpTransport,
    private readonly executions: InMemoryPublicationExecutionStore,
  ) {}

  async uploadVideo(
    request: DouyinUploadVideoRequestV1,
    ctx: DouyinUploadClientContext,
  ): Promise<{ response: DouyinUploadVideoResponseV1; execution: DouyinPublicationExecutionRecord; attempts: number }> {
    this.assertPreHttp(request, ctx);
    const key = request.idempotencyKey;
    const existing = this.executions.get(key);
    if (existing?.status === 'UPLOAD_COMPLETED' && existing.uploadVideoId) {
      return {
        response: {
          success: true,
          status: 'UPLOAD_COMPLETED',
          videoId: existing.uploadVideoId,
          width: null,
          height: null,
          errorCode: 0,
          description: null,
          logId: null,
        },
        execution: existing,
        attempts: 0,
      };
    }
    const bytes = readFileSync(request.filePath);
    const liveSha = createHash('sha256').update(bytes).digest('hex');
    if (liveSha !== (ctx.expectedSha256 ?? ACCEPTED_VERTICAL_SHA_V2) || liveSha !== request.artifactSHA256) {
      throw new DouyinProviderError('ARTIFACT_ACCEPTANCE_STALE', { message: 'BLOCK_UPLOAD' });
    }
    const policy = evaluateDouyinUploadStrategy(bytes.length);
    if (policy.selectedStrategy === 'FILE_TOO_LARGE') throw new DouyinProviderError('FILE_TOO_LARGE');
    if (policy.selectedStrategy === 'CHUNKED_UPLOAD_REQUIRED') {
      throw new DouyinProviderError('FILE_TOO_LARGE', { message: 'CHUNK_RUNTIME_NOT_IMPLEMENTED' });
    }

    let execution = existing ?? this.executions.put({
      executionId: randomUUID(),
      idempotencyKey: key,
      platform: 'DOUYIN',
      accountConnectionId: request.accountConnectionId,
      artifactSHA256: request.artifactSHA256,
      publicationAuthorizationId: ctx.authorization?.authorizationId ?? '',
      status: 'READY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assertTransition(execution.status === 'UPLOAD_FAILED' ? 'UPLOAD_FAILED' : 'READY', 'UPLOADING');
    execution = this.executions.put({ ...execution, status: 'UPLOADING', updatedAt: new Date().toISOString() });

    const requestId = randomUUID();
    const filename = path.basename(request.filePath).replace(/[^\w.\-]+/g, '_');
    let lastError: unknown;
    let attempts = 0;
    const maxAttempts = UPLOAD_MAX_TRANSIENT_RETRIES;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const http = await this.transport.sendMultipart(
          {
            method: 'POST',
            path: DOUYIN_UPLOAD_VIDEO_PATH,
            headers: { 'access-token': ctx.accessToken },
            query: { open_id: request.openId },
            timeoutMs: ctx.timeoutMs ?? DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS,
            requestId,
            endpointName: 'upload_video',
          },
          { fieldName: 'video', filename, contentType: request.contentType || 'video/mp4', bytes },
        );
        if (http.status >= 400) {
          const mapped = mapHttpError(http.status, http.json);
          const err = new DouyinProviderError(mapped.code as never, {
            officialErrorCode: mapped.officialErrorCode ?? undefined,
            description: mapped.description ?? undefined,
            logId: mapped.logId ?? undefined,
            endpointName: 'upload_video',
            httpStatus: http.status,
          });
          if (!isRetryableUpload(err.code) || attempts >= maxAttempts) throw err;
          lastError = err;
          continue;
        }
        let parsed;
        try {
          parsed = requireUploadSuccess(http.json);
        } catch {
          throw new DouyinProviderError('UPLOAD_REJECTED', { endpointName: 'upload_video' });
        }
        assertTransition('UPLOADING', 'UPLOAD_COMPLETED');
        execution = this.executions.put({
          ...execution,
          status: 'UPLOAD_COMPLETED',
          uploadVideoId: parsed.videoId,
          requestId,
          updatedAt: new Date().toISOString(),
        });
        return { response: parsed, execution, attempts };
      } catch (error) {
        lastError = error;
        if (error instanceof DouyinProviderError && !isRetryableUpload(error.code)) throw error;
        if (attempts >= maxAttempts) break;
        const delay = ctx.retryDelayMs ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay * 2 ** (attempts - 1)));
      }
    }
    this.executions.put({ ...execution, status: 'UPLOAD_FAILED', updatedAt: new Date().toISOString() });
    if (lastError instanceof DouyinProviderError) throw lastError;
    throw new DouyinProviderError('NETWORK_TRANSIENT', { endpointName: 'upload_video' });
  }

  private assertPreHttp(request: DouyinUploadVideoRequestV1, ctx: DouyinUploadClientContext): void {
    if (!ctx.liveEnabled) throw new DouyinProviderError('LIVE_CALLS_DISABLED');
    if (!ctx.account) throw new DouyinProviderError('ACCOUNT_NOT_CONNECTED');
    try {
      assertSameTenantWorkspace({
        accountTenantId: ctx.account.tenantId,
        accountWorkspaceId: ctx.account.workspaceId,
        actorTenantId: ctx.actorTenantId,
        actorWorkspaceId: ctx.actorWorkspaceId,
      });
    } catch {
      throw new DouyinProviderError('CROSS_TENANT_DENIED');
    }
    assertPublishingEligible({
      account: ctx.account,
      actorTenantId: ctx.actorTenantId,
      actorWorkspaceId: ctx.actorWorkspaceId,
      capability: ctx.capability,
      credentialDecryptable: ctx.credentialDecryptable,
    });
    assertPublicationAuthorizationActive(ctx.authorization, {
      artifactId: request.artifactId,
      artifactSHA256: request.artifactSHA256,
      accountConnectionId: request.accountConnectionId,
    });
    if (!existsSync(request.filePath)) throw new DouyinProviderError('FILE_INVALID');
    const size = statSync(request.filePath).size;
    if (size <= 0) throw new DouyinProviderError('FILE_INVALID');
    if (request.contentType && request.contentType !== 'video/mp4' && !request.filePath.toLowerCase().endsWith('.mp4')) {
      throw new DouyinProviderError('INVALID_VIDEO');
    }
  }
}

export function isRetryableUpload(code: string): boolean {
  return code === 'NETWORK_TRANSIENT' || code === 'RATE_LIMITED';
}

export function hashFileSha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

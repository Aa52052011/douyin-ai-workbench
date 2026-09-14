import { randomUUID } from 'node:crypto';
import type { DouyinCreateVideoRequestV1 } from '../providers/douyin-official-open-platform.v1.js';
import { DouyinProviderError } from './douyin-provider-error.js';
import { DOUYIN_CREATE_VIDEO_PATH } from './douyin-endpoints.js';
import type { DouyinHttpTransport } from './douyin-http.transport.js';
import { assertPublicationAuthorizationActive, type PublicationAuthorizationV1 } from './douyin-publication-authorization.js';
import { requireCreateSuccess, type DouyinCreateVideoResponseV1 } from './douyin-response-parsers.js';
import { DEFAULT_DOUYIN_CREATE_TIMEOUT_MS } from './douyin-runtime-config.js';
import { assertPublishingEligible, type ProviderCapabilityState } from './douyin-account-eligibility.js';
import type { DouyinConnectedAccountV1 } from '../providers/douyin-official-open-platform.v1.js';
import {
  assertTransition,
  canRetryCreate,
  duplicateCreateForbidden,
  type InMemoryPublicationExecutionStore,
  type DouyinPublicationExecutionRecord,
} from './douyin-publication-state-machine.js';

export const CREATE_MAX_RETRIES = 0;

export type DouyinCreateClientContext = {
  actorTenantId: string;
  actorWorkspaceId: string;
  account: DouyinConnectedAccountV1 | null;
  authorization: PublicationAuthorizationV1 | null;
  capability: ProviderCapabilityState;
  credentialDecryptable: boolean;
  liveEnabled: boolean;
  accessToken: string;
  captionApproved: boolean;
  coverDecisionApproved: boolean;
  settingsApproved: boolean;
  truthGatePass: boolean;
  timeoutMs?: number;
};

export class DouyinCreateVideoClientV1 {
  constructor(
    private readonly transport: DouyinHttpTransport,
    private readonly executions: InMemoryPublicationExecutionStore,
  ) {}

  async createVideo(
    request: DouyinCreateVideoRequestV1,
    ctx: DouyinCreateClientContext,
  ): Promise<{ response: DouyinCreateVideoResponseV1; execution: DouyinPublicationExecutionRecord; attempts: number }> {
    if (!ctx.liveEnabled) throw new DouyinProviderError('LIVE_CALLS_DISABLED');
    if (!ctx.account) throw new DouyinProviderError('ACCOUNT_NOT_CONNECTED');
    if (ctx.account.accountConnectionId !== request.accountConnectionId) {
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
      artifactId: ctx.authorization?.artifactId ?? '',
      artifactSHA256: ctx.authorization?.artifactSHA256 ?? '',
      accountConnectionId: request.accountConnectionId,
    });
    if (!ctx.captionApproved || !ctx.coverDecisionApproved || !ctx.settingsApproved) {
      throw new DouyinProviderError('BLOCKED_HUMAN_METADATA_APPROVAL');
    }
    if (!ctx.truthGatePass) throw new DouyinProviderError('BLOCK_PUBLICATION_ACTION');
    if (!request.videoId) throw new DouyinProviderError('INVALID_VIDEO');

    const execution = this.executions.get(request.idempotencyKey);
    if (!execution) {
      throw new DouyinProviderError('INVALID_STATE_TRANSITION', { message: 'create requires existing upload execution' });
    }
    if (duplicateCreateForbidden(execution.status)) {
      throw new DouyinProviderError('DUPLICATE_CREATE_FORBIDDEN');
    }
    if (execution.status !== 'UPLOAD_COMPLETED' || execution.uploadVideoId !== request.videoId) {
      throw new DouyinProviderError('INVALID_STATE_TRANSITION', { message: 'create requires UPLOAD_COMPLETED same execution' });
    }

    assertTransition('UPLOAD_COMPLETED', 'CREATE_SUBMITTING');
    this.executions.put({ ...execution, status: 'CREATE_SUBMITTING', updatedAt: new Date().toISOString() });

    const requestId = randomUUID();
    const body: Record<string, unknown> = { video_id: request.videoId, text: request.text };
    if (typeof request.coverTsp === 'number') body.cover_tsp = request.coverTsp;

    try {
      const http = await this.transport.sendJson(
        {
          method: 'POST',
          path: DOUYIN_CREATE_VIDEO_PATH,
          headers: { 'access-token': ctx.accessToken, 'content-type': 'application/json' },
          query: { open_id: request.openId },
          timeoutMs: ctx.timeoutMs ?? DEFAULT_DOUYIN_CREATE_TIMEOUT_MS,
          requestId,
          endpointName: 'create_video',
        },
        body,
      );
      const parsed = requireCreateSuccess(http.json, request.videoId);
      const nextStatus = parsed.status === 'UNDER_PLATFORM_REVIEW' ? 'UNDER_PLATFORM_REVIEW' : 'CREATE_SUBMITTED';
      assertTransition('CREATE_SUBMITTING', nextStatus);
      const updated = this.executions.put({
        ...execution,
        status: nextStatus,
        platformItemId: parsed.platformItemId ?? undefined,
        requestId,
        updatedAt: new Date().toISOString(),
      });
      return { response: parsed, execution: updated, attempts: 1 };
    } catch (error) {
      if (error instanceof DouyinProviderError && error.code === 'AMBIGUOUS_CREATE_STATE') {
        this.executions.put({
          ...execution,
          status: 'AMBIGUOUS_CREATE_STATE',
          requestId,
          attemptedAt: new Date().toISOString(),
          uploadVideoId: request.videoId,
          updatedAt: new Date().toISOString(),
        });
        throw error;
      }
      this.executions.put({ ...execution, status: 'CREATE_FAILED', updatedAt: new Date().toISOString() });
      if (error instanceof DouyinProviderError) throw error;
      throw new DouyinProviderError('CREATE_REJECTED', { endpointName: 'create_video' });
    }
  }
}

void canRetryCreate;
void CREATE_MAX_RETRIES;

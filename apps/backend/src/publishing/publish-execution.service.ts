import { Injectable } from '@nestjs/common';
import {
  AssetLinkRole,
  AssetStatus,
  AssetType,
  JobKind,
  JobStatus,
  PlatformAccountStatus,
  Prisma,
  PrismaClient,
  PublicationStatus,
  VideoStatus,
  type Job,
  type PlatformAccount,
  type Publication,
} from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { JobsService } from '../jobs/jobs.service.js';
import { sanitizeProviderResponseMetadata } from './provider-response-metadata.js';
import { isUnknownExternalState } from './publication-status.js';
import { PublishingProviderRegistry } from './providers/publishing-provider.registry.js';
import type {
  PlatformAccountRef,
  PublishVideoResult,
  PublishingRetryClass,
} from './providers/publishing-provider.types.js';
import { readPublicationIdFromJobInput } from './publish-job-input.js';

export type PublishProcessResult = {
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
};

@Injectable()
export class PublishExecutionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    private readonly providers: PublishingProviderRegistry,
  ) {}

  async run(tenantId: string, jobId: string): Promise<PublishProcessResult> {
    const claimed = await this.jobs.claim(tenantId, jobId);
    if (claimed.kind !== JobKind.VIDEO_PUBLISH) {
      throw new AppError(ErrorCode.JOB_KIND_UNSUPPORTED);
    }
    const heartbeat = this.jobs.startHeartbeat(tenantId, jobId);
    try {
      const publicationId = readPublicationIdFromJobInput(claimed.input);
      if (!publicationId) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }
      const publication = await this.prisma.publication.findFirst({
        where: { id: publicationId, tenantId },
        include: { platformAccount: true },
      });
      if (!publication) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }
      if (
        publication.tenantId !== claimed.tenantId ||
        publication.workspaceId !== claimed.workspaceId ||
        publication.projectId !== claimed.projectId ||
        publication.videoId !== claimed.videoId
      ) {
        throw new AppError(ErrorCode.JOB_ISOLATION_VIOLATION);
      }
      if (publication.sourceJobId !== claimed.id) {
        await this.supersede(tenantId, claimed.id);
        return { status: 'skipped', reason: 'superseded' };
      }

      const guarded = await this.handleDurableState(claimed, publication);
      if (guarded) {
        return guarded;
      }

      await this.executePublish(claimed, publication);
      return { status: 'completed' };
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.JOB_CONFLICT) {
        throw error;
      }
      await this.failExecution(tenantId, jobId, error);
      throw error;
    } finally {
      heartbeat.stop();
    }
  }

  async reconcilePublication(tenantId: string, publicationId: string): Promise<Publication> {
    const publication = await this.prisma.publication.findFirst({
      where: { id: publicationId, tenantId },
      include: { platformAccount: true },
    });
    if (!publication) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    if (publication.status !== PublicationStatus.PROCESSING) {
      return publication;
    }
    if (!publication.platformAccount) {
      return publication;
    }
    const provider = this.providers.resolve(publication.platform);
    const status = await provider.getPublishStatus({
      tenantId,
      workspaceId: publication.workspaceId,
      platformAccount: toAccountRef(publication.platformAccount),
      publicationId: publication.id,
      providerItemId: publication.providerItemId ?? undefined,
      externalPostId: publication.externalPostId ?? undefined,
    });
    if (status.platformStatus !== 'PUBLISHED') {
      return publication;
    }
    const updated = await this.prisma.publication.update({
      where: { id_tenantId: { id: publication.id, tenantId } },
      data: {
        status: PublicationStatus.PUBLISHED,
        publishedAt: publication.publishedAt ?? new Date(),
        providerItemId: status.providerItemId ?? publication.providerItemId,
        externalPostId: status.externalPostId ?? publication.externalPostId,
        externalUrl: status.externalUrl ?? publication.externalUrl,
        providerResponseMetadata: mergeMetadata(publication.providerResponseMetadata, {
          ...status.metadata,
          status: 'PUBLISHED',
        }),
      },
    });
    return updated;
  }

  private async handleDurableState(job: Job, publication: Publication & { platformAccount: PlatformAccount | null }) {
    if (publication.status === PublicationStatus.PUBLISHED) {
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'SKIPPED', reason: 'already-published' }));
      return { status: 'skipped' as const, reason: 'already-published' };
    }
    if (isUnknownExternalState(publication.status)) {
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'SKIPPED', reason: 'unknown-external-state' }));
      return { status: 'skipped' as const, reason: 'unknown-external-state' };
    }
    if (publication.status === PublicationStatus.PROCESSING) {
      await this.reconcilePublication(job.tenantId, publication.id);
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'SKIPPED', reason: 'reconciled' }));
      return { status: 'skipped' as const, reason: 'reconciled' };
    }
    if (publication.status === PublicationStatus.SUBMITTING) {
      await this.markUnknown(publication, {
        errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
        errorMessage: 'Submit boundary could not be confirmed; will not replay',
        metadata: {
          retryClass: 'UNKNOWN_EXTERNAL_STATE',
          errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
          status: 'UNKNOWN',
          providerUploadId: publication.providerUploadId,
        },
      });
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'UNKNOWN', reason: 'submitting-unconfirmed' }));
      return { status: 'completed' as const, reason: 'submitting-unconfirmed' };
    }
    if (publication.status === PublicationStatus.FAILED || publication.status === PublicationStatus.CANCELLED) {
      await this.jobs.fail(job.tenantId, job.id, {
        code: ErrorCode.PUBLICATION_CONFLICT,
        message: 'Publication is not executable',
      });
      return { status: 'skipped' as const, reason: 'not-executable' };
    }
    return null;
  }

  private async executePublish(job: Job, publication: Publication & { platformAccount: PlatformAccount | null }) {
    const provider = this.providers.resolve(publication.platform);
    const account = publication.platformAccount;
    if (!account) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    const health = await provider.validateAccount({
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      account: toAccountRef(account),
      expectedPlatform: publication.platform,
    });
    if (!health.healthy) {
      await this.persistRejected(job, publication, {
        errorCode: health.reason === 'PLATFORM_MISMATCH' ? ErrorCode.PUBLISH_PLATFORM_MISMATCH : 'PUBLISH_ACCOUNT_INVALID',
        errorMessage: health.reason ?? 'Platform account is not healthy',
        retryClass: 'PERMANENT',
        metadata: { retryClass: 'PERMANENT', errorCode: health.reason, status: 'FAILED' },
      });
      return;
    }

    const output = await this.requireOutputAsset(job, publication);
    await this.prisma.publication.updateMany({
      where: {
        id: publication.id,
        tenantId: job.tenantId,
        sourceJobId: job.id,
        status: { in: [PublicationStatus.PENDING, PublicationStatus.UPLOADING] },
      },
      data: { status: PublicationStatus.SUBMITTING },
    });

    let result: PublishVideoResult;
    try {
      result = await provider.publishVideo({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        publicationId: publication.id,
        videoId: publication.videoId,
        platformAccount: toAccountRef(account),
        outputAsset: output,
        title: publication.title,
        description: publication.description,
        hashtags: publication.hashtags,
        visibility: publication.visibility,
        idempotencyKey: publication.idempotencyKey,
        providerUploadId: publication.providerUploadId ?? undefined,
      });
    } catch {
      await this.markUnknown(publication, {
        errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
        errorMessage: 'Provider call failed after submit checkpoint',
        metadata: {
          retryClass: 'UNKNOWN_EXTERNAL_STATE',
          errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
          status: 'UNKNOWN',
          providerUploadId: publication.providerUploadId,
        },
      });
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'UNKNOWN' }));
      return;
    }

    if (result.outcome === 'UNKNOWN') {
      await this.markUnknown(publication, {
        errorCode: result.errorCode,
        errorMessage: 'Platform submit result is unknown',
        providerUploadId: result.providerUploadId,
        metadata: {
          ...result.metadata,
          retryClass: result.retryClass,
          requestId: result.requestId,
          providerUploadId: result.providerUploadId,
        },
      });
      await this.jobs.complete(job.tenantId, job.id, publicJobOutput({ outcome: 'UNKNOWN', requestId: result.requestId }));
      return;
    }

    if (result.outcome === 'REJECTED') {
      await this.persistRejected(job, publication, result);
      return;
    }

    await this.persistAccepted(job, publication, result);
    if (result.platformStatus === 'PROCESSING') {
      await this.reconcilePublication(job.tenantId, publication.id);
    }
  }

  private async persistAccepted(job: Job, publication: Publication, result: Extract<PublishVideoResult, { outcome: 'ACCEPTED' }>) {
    const published = result.platformStatus === 'PUBLISHED';
    await this.prisma.publication.updateMany({
      where: { id: publication.id, tenantId: job.tenantId, sourceJobId: job.id },
      data: {
        status: published ? PublicationStatus.PUBLISHED : PublicationStatus.PROCESSING,
        publishedAt: published ? new Date() : null,
        providerUploadId: result.providerUploadId,
        providerItemId: result.providerItemId ?? publication.providerItemId,
        externalPostId: result.externalPostId ?? null,
        externalUrl: result.externalUrl ?? null,
        errorCode: null,
        errorMessage: null,
        providerResponseMetadata: mergeMetadata(publication.providerResponseMetadata, result.metadata),
      },
    });
    await this.jobs.complete(
      job.tenantId,
      job.id,
      publicJobOutput({
        outcome: 'ACCEPTED',
        platformStatus: result.platformStatus,
        publicationStatus: published ? 'PUBLISHED' : 'PROCESSING',
        requestId: result.requestId,
      }),
    );
  }

  private async persistRejected(
    job: Job,
    publication: Publication,
    result: { errorCode: string; errorMessage: string; retryClass: PublishingRetryClass; metadata: Record<string, unknown> },
  ) {
    await this.prisma.publication.updateMany({
      where: { id: publication.id, tenantId: job.tenantId, sourceJobId: job.id },
      data: {
        status: PublicationStatus.FAILED,
        publishedAt: null,
        externalPostId: null,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        providerResponseMetadata: mergeMetadata(publication.providerResponseMetadata, {
          ...result.metadata,
          retryClass: result.retryClass,
          errorCode: result.errorCode,
          status: 'FAILED',
        }),
      },
    });
    await this.jobs.fail(job.tenantId, job.id, {
      code: result.errorCode,
      message: result.errorMessage,
      retryClass: result.retryClass,
    });
  }

  private async markUnknown(
    publication: Publication,
    input: {
      errorCode: string;
      errorMessage: string;
      providerUploadId?: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.prisma.publication.updateMany({
      where: {
        id: publication.id,
        tenantId: publication.tenantId,
        status: { notIn: [PublicationStatus.PUBLISHED] },
      },
      data: {
        status: PublicationStatus.UNKNOWN_EXTERNAL_STATE,
        publishedAt: null,
        externalPostId: null,
        providerUploadId: input.providerUploadId ?? publication.providerUploadId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        providerResponseMetadata: mergeMetadata(publication.providerResponseMetadata, {
          ...input.metadata,
          retryClass: 'UNKNOWN_EXTERNAL_STATE',
          status: 'UNKNOWN',
        }),
      },
    });
  }

  private async requireOutputAsset(job: Job, publication: Publication) {
    const video = await this.prisma.video.findFirst({
      where: {
        id: publication.videoId,
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        deletedAt: null,
      },
    });
    if (!video || video.status !== VideoStatus.COMPLETED || !video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: video.outputAssetId, tenantId: job.tenantId, deletedAt: null },
    });
    if (!asset || asset.type !== AssetType.VIDEO || asset.status !== AssetStatus.READY) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const link = await this.prisma.assetLink.findFirst({
      where: {
        tenantId: job.tenantId,
        videoId: video.id,
        assetId: asset.id,
        role: AssetLinkRole.VIDEO_OUTPUT,
      },
    });
    if (!link) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    return { assetId: asset.id, storageKey: asset.storageKey, mimeType: asset.mimeType ?? undefined, size: asset.size ?? undefined };
  }

  private async failExecution(tenantId: string, jobId: string, error: unknown) {
    const payload =
      error instanceof AppError
        ? { code: error.code, message: error.message }
        : { code: ErrorCode.VIDEO_PROVIDER_FAILED, message: 'Publish execution failed' };
    await this.jobs.fail(tenantId, jobId, payload);
    const job = await this.prisma.job.findFirst({ where: { id: jobId, tenantId } });
    const publicationId = readPublicationIdFromJobInput(job?.input);
    if (!publicationId) {
      return;
    }
    const publication = await this.prisma.publication.findFirst({ where: { id: publicationId, tenantId } });
    if (!publication || publication.sourceJobId !== jobId) {
      return;
    }
    if (publication.status === PublicationStatus.SUBMITTING) {
      await this.markUnknown(publication, {
        errorCode: payload.code,
        errorMessage: typeof payload.message === 'string' ? payload.message : 'Publish execution failed',
        metadata: { retryClass: 'UNKNOWN_EXTERNAL_STATE', errorCode: payload.code, status: 'UNKNOWN' },
      });
      return;
    }
    if (
      publication.status === PublicationStatus.PENDING ||
      publication.status === PublicationStatus.UPLOADING
    ) {
      await this.prisma.publication.updateMany({
        where: { id: publicationId, tenantId, sourceJobId: jobId },
        data: {
          status: PublicationStatus.FAILED,
          errorCode: payload.code,
          errorMessage: typeof payload.message === 'string' ? payload.message : 'Publish execution failed',
          providerResponseMetadata: {
            retryClass: 'TEMPORARY',
            errorCode: payload.code,
            status: 'FAILED',
          },
        },
      });
    }
  }

  private async supersede(tenantId: string, jobId: string) {
    await this.prisma.job.updateMany({
      where: { id: jobId, tenantId, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
      data: {
        status: JobStatus.CANCELLED,
        error: { code: 'PUBLICATION_JOB_SUPERSEDED', message: 'A newer publish job superseded this execution' },
        completedAt: new Date(),
        lockedAt: null,
      },
    });
  }
}

function toAccountRef(account: PlatformAccount): PlatformAccountRef {
  if (account.status === PlatformAccountStatus.ACTIVE) {
    return {
      id: account.id,
      platform: account.platform,
      status: account.status,
      credentialRef: account.credentialRef,
      externalAccountId: account.externalAccountId,
      displayName: account.displayName,
    };
  }
  return {
    id: account.id,
    platform: account.platform,
    status: account.status,
    credentialRef: account.credentialRef,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
  };
}

function mergeMetadata(existing: Prisma.JsonValue, incoming: Record<string, unknown>): Prisma.InputJsonValue {
  return sanitizeProviderResponseMetadata({
    ...(typeof existing === 'object' && existing && !Array.isArray(existing) ? existing : {}),
    ...incoming,
  }) as Prisma.InputJsonValue;
}

function publicJobOutput(value: Record<string, unknown>): Prisma.InputJsonValue {
  const { storageKey: _s, credentialRef: _c, accessToken: _a, refreshToken: _r, ...safe } = value;
  void _s;
  void _c;
  void _a;
  void _r;
  return safe as Prisma.InputJsonValue;
}

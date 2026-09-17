import { Inject, Injectable } from '@nestjs/common';
import {
  AssetLinkRole,
  AssetStatus,
  AssetType,
  JobKind,
  JobStatus,
  Platform,
  PlatformAccountStatus,
  Prisma,
  PrismaClient,
  PublicationMode,
  PublicationStatus,
  PublicationVerificationStatus,
  PublicationRegistrationSource,
  PublishedPostLifecycleStatus,
  MonitoringRuntimeStatus,
  MonitoringMode,
  VideoStatus,
} from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { JobQueue } from '../jobs/queue/job-queue.js';
import { JOB_QUEUE } from '../jobs/queue/queue.constants.js';
import { StorageService } from '../media/storage/storage.service.js';
import { samePublicationRequest } from './publication-fingerprint.js';
import { isHttpRetryAllowed, readRetryClass } from './publication-status.js';
import { PublishingProviderRegistry } from './providers/publishing-provider.registry.js';
import { toPublicPublication, type PublicationPublic } from './publications.mapper.js';
import type { CreatePublicationDto } from './dto/create-publication.dto.js';
import {
  requireManualExternalIdentity,
  sameManualExternalIdentity,
} from './manual-external-identity.js';
import { readPublicationIdFromJobInput } from './publish-job-input.js';
import { canUseVideoAsManualPublicationSource, sourceBindingFromAcceptance } from './publication-source-binding.js';
import { isCurrentVerticalAcceptance } from '../videos/video-final-acceptance.js';

@Injectable()
export class PublicationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly storage: StorageService,
    private readonly providers: PublishingProviderRegistry,
  ) {}

  async list(
    auth: AuthContext,
    query: { projectId?: string; videoId?: string; status?: PublicationStatus },
    workspaceHint?: string,
  ): Promise<PublicationPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (query.projectId) {
      await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    }
    const rows = await this.prisma.publication.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        videoId: query.videoId,
        status: query.status,
      },
      include: { platformAccount: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toPublicPublication(row, row.platformAccount));
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<PublicationPublic> {
    const publication = await this.requirePublication(auth, id, workspaceHint);
    return this.present(publication, publication.platformAccount);
  }

  async create(
    auth: AuthContext,
    videoId: string,
    dto: CreatePublicationDto,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<PublicationPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const video = await this.requirePublishableVideo(auth.tenantId, workspaceId, videoId);
    if (dto.mode === PublicationMode.MANUAL) {
      const acceptance = await this.requireCurrentFinalAcceptance(auth.tenantId, video);
      return this.createManual(auth, video, dto, meta, workspaceId, acceptance);
    }
    this.providers.resolve(dto.platform);
    if (!dto.platformAccountId) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    const account = await this.requireActiveAccount(auth.tenantId, workspaceId, dto.platformAccountId, dto.platform);

    const incoming = {
      videoId: video.id,
      platformAccountId: account.id,
      platform: dto.platform,
      mode: dto.mode,
      title: dto.title,
      description: dto.description ?? '',
      hashtags: dto.hashtags ?? [],
      visibility: dto.visibility,
    };

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.publication.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: auth.tenantId, idempotencyKey: meta.idempotencyKey },
          },
          include: { platformAccount: true },
        });
        if (existing) {
          if (
            !samePublicationRequest(existing, incoming) ||
            existing.workspaceId !== workspaceId ||
            existing.projectId !== video.projectId
          ) {
            throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
          }
          return { publication: existing, jobId: null as string | null };
        }

        const publication = await tx.publication.create({
          data: {
            tenantId: auth.tenantId,
            workspaceId,
            projectId: video.projectId,
            videoId: video.id,
            platformAccountId: account.id,
            platform: dto.platform,
            mode: PublicationMode.API,
            status: PublicationStatus.PENDING,
            title: dto.title,
            description: dto.description ?? '',
            hashtags: dto.hashtags ?? [],
            visibility: dto.visibility,
            idempotencyKey: meta.idempotencyKey,
            createdByUserId: auth.userId,
          },
        });
        const job = await tx.job.create({
          data: {
            tenantId: auth.tenantId,
            workspaceId,
            projectId: video.projectId,
            kind: JobKind.VIDEO_PUBLISH,
            status: JobStatus.PENDING,
            requestId: meta.idempotencyKey,
            provider: 'mock-publisher',
            videoId: video.id,
            input: { publicationId: publication.id },
          },
        });
        const linked = await tx.publication.update({
          where: { id_tenantId: { id: publication.id, tenantId: auth.tenantId } },
          data: { sourceJobId: job.id },
          include: { platformAccount: true },
        });
        return { publication: linked, jobId: job.id };
      });

      if (created.jobId) {
        await this.dispatch(auth.tenantId, created.jobId, created.publication.id);
      }
      return toPublicPublication(created.publication, created.publication.platformAccount);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.publication.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: auth.tenantId, idempotencyKey: meta.idempotencyKey },
          },
          include: { platformAccount: true },
        });
        if (existing && samePublicationRequest(existing, incoming)) {
          return toPublicPublication(existing, existing.platformAccount);
        }
        throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
      }
      throw error;
    }
  }

  async retry(
    auth: AuthContext,
    id: string,
    meta: { idempotencyKey: string; workspaceHint?: string },
  ): Promise<PublicationPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM publications
        WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
        FOR UPDATE
      `;
      const publication = await tx.publication.findFirst({
        where: { id, tenantId: auth.tenantId, workspaceId },
        include: { platformAccount: true },
      });
      if (!publication) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }

      const replay = await tx.job.findFirst({
        where: {
          tenantId: auth.tenantId,
          workspaceId,
          kind: JobKind.VIDEO_PUBLISH,
          requestId: meta.idempotencyKey,
          videoId: publication.videoId,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (replay && readPublicationIdFromJobInput(replay.input) === publication.id) {
        return { publication, jobId: null as string | null };
      }

      if (!isHttpRetryAllowed(publication.status, readRetryClass(publication.providerResponseMetadata))) {
        if (publication.status === PublicationStatus.FAILED) {
          throw new AppError(ErrorCode.PUBLICATION_RETRY_NOT_ALLOWED);
        }
        throw new AppError(ErrorCode.PUBLICATION_CONFLICT);
      }

      const job = await tx.job.create({
        data: {
          tenantId: auth.tenantId,
          workspaceId,
          projectId: publication.projectId,
          kind: JobKind.VIDEO_PUBLISH,
          status: JobStatus.PENDING,
          requestId: meta.idempotencyKey,
          provider: 'mock-publisher',
          videoId: publication.videoId,
          input: { publicationId: publication.id },
        },
      });
      const updated = await tx.publication.update({
        where: { id_tenantId: { id: publication.id, tenantId: auth.tenantId } },
        data: {
          sourceJobId: job.id,
          status: PublicationStatus.PENDING,
          errorCode: null,
          errorMessage: null,
        },
        include: { platformAccount: true },
      });
      return { publication: updated, jobId: job.id };
    });

    if (result.jobId) {
      await this.dispatch(auth.tenantId, result.jobId, result.publication.id);
    }
    return this.present(result.publication, result.publication.platformAccount);
  }

  async completeManual(
    auth: AuthContext,
    id: string,
    dto: { externalPostId?: string; externalUrl?: string },
    workspaceHint?: string,
  ): Promise<PublicationPublic> {
    const identity = requireManualExternalIdentity(dto);
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    const publication = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM publications
        WHERE id = ${id}::uuid AND tenant_id = ${auth.tenantId}::uuid
        FOR UPDATE
      `;
      const current = await tx.publication.findFirst({
        where: { id, tenantId: auth.tenantId, workspaceId },
        include: { platformAccount: true },
      });
      if (!current) {
        throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
      }
      if (current.mode !== PublicationMode.MANUAL) {
        throw new AppError(ErrorCode.MANUAL_PUBLICATION_INVALID_STATE);
      }
      if (current.videoId && (identity.externalUrl || identity.externalPostId)) {
        const duplicate = await tx.publication.findFirst({
          where: {
            tenantId: auth.tenantId,
            videoId: current.videoId,
            mode: PublicationMode.MANUAL,
            OR: [
              ...(identity.externalUrl ? [{ externalUrl: identity.externalUrl }] : []),
              ...(identity.externalPostId ? [{ externalPostId: identity.externalPostId }] : []),
            ],
          },
          include: { platformAccount: true },
          orderBy: { createdAt: 'desc' },
        });
        if (duplicate && duplicate.status === PublicationStatus.PUBLISHED) {
          if (sameManualExternalIdentity(duplicate, identity) || duplicate.id === current.id) {
            return duplicate;
          }
        }
      }
      if (current.status === PublicationStatus.PUBLISHED) {
        if (sameManualExternalIdentity(current, identity)) {
          return current;
        }
        throw new AppError(ErrorCode.MANUAL_PUBLICATION_ALREADY_COMPLETED);
      }
      if (current.status !== PublicationStatus.PENDING) {
        throw new AppError(ErrorCode.MANUAL_PUBLICATION_INVALID_STATE);
      }
      return tx.publication.update({
        where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
        data: {
          status: PublicationStatus.PUBLISHED,
          externalPostId: identity.externalPostId,
          externalUrl: identity.externalUrl,
          publishedAt: current.publishedAt ?? new Date(),
          registeredAt: current.registeredAt ?? new Date(),
          verificationStatus: current.verificationStatus ?? PublicationVerificationStatus.USER_ASSERTED,
          registrationSource: current.registrationSource ?? PublicationRegistrationSource.USER_PASTED_URL,
          monitoringMode: MonitoringMode.MANUAL_IMPORT,
          lifecycleStatus: PublishedPostLifecycleStatus.REGISTERED,
          monitoringStatus:
            current.monitoringStatus === MonitoringRuntimeStatus.WAITING_REGISTRATION
              ? MonitoringRuntimeStatus.READY
              : current.monitoringStatus,
          ...(await this.manualSourcePatch(tx, auth.tenantId, current)),
        },
        include: { platformAccount: true },
      });
    });
    return this.present(publication, publication.platformAccount);
  }

  private async createManual(
    auth: AuthContext,
    video: { id: string; projectId: string; scriptId: string | null },
    dto: CreatePublicationDto,
    meta: { idempotencyKey: string },
    workspaceId: string,
    acceptance: { acceptedArtifactId: string; videoId: string; current: boolean; variant: string; status: string },
  ): Promise<PublicationPublic> {
    const binding = sourceBindingFromAcceptance({
      videoId: video.id,
      scriptId: video.scriptId,
      acceptance,
    });
    let platformAccountId: string | null = null;
    if (dto.platformAccountId) {
      const account = await this.requireAccountHint(auth.tenantId, workspaceId, dto.platformAccountId, dto.platform);
      platformAccountId = account.id;
    }
    const incoming = {
      videoId: video.id,
      platformAccountId,
      platform: dto.platform,
      mode: PublicationMode.MANUAL,
      title: dto.title,
      description: dto.description ?? '',
      hashtags: dto.hashtags ?? [],
      visibility: dto.visibility,
    };
    try {
      const publication = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.publication.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: auth.tenantId, idempotencyKey: meta.idempotencyKey },
          },
          include: { platformAccount: true },
        });
        if (existing) {
          if (
            !samePublicationRequest(existing, incoming) ||
            existing.workspaceId !== workspaceId ||
            existing.projectId !== video.projectId
          ) {
            throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
          }
          return existing;
        }
        const pendingForVideo = await tx.publication.findFirst({
          where: {
            tenantId: auth.tenantId,
            videoId: video.id,
            mode: PublicationMode.MANUAL,
            status: PublicationStatus.PENDING,
          },
          include: { platformAccount: true },
          orderBy: { createdAt: 'desc' },
        });
        if (pendingForVideo) {
          return pendingForVideo;
        }
        return tx.publication.create({
          data: {
            tenantId: auth.tenantId,
            workspaceId,
            projectId: video.projectId,
            videoId: binding.videoId,
            scriptId: binding.scriptId,
            productionArtifactId: binding.productionArtifactId,
            platformAccountId,
            platform: dto.platform,
            mode: PublicationMode.MANUAL,
            status: PublicationStatus.PENDING,
            verificationStatus: PublicationVerificationStatus.USER_ASSERTED,
            registrationSource: PublicationRegistrationSource.USER_PASTED_URL,
            monitoringMode: MonitoringMode.MANUAL_IMPORT,
            title: dto.title,
            description: dto.description ?? '',
            hashtags: dto.hashtags ?? [],
            visibility: dto.visibility,
            idempotencyKey: meta.idempotencyKey,
            createdByUserId: auth.userId,
          },
          include: { platformAccount: true },
        });
      });
      return this.present(publication, publication.platformAccount);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.publication.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: auth.tenantId, idempotencyKey: meta.idempotencyKey },
          },
          include: { platformAccount: true },
        });
        if (existing && samePublicationRequest(existing, incoming)) {
          return this.present(existing, existing.platformAccount);
        }
        throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
      }
      throw error;
    }
  }

  private async dispatch(tenantId: string, jobId: string, publicationId: string): Promise<void> {
    try {
      await this.queue.enqueue(jobId);
    } catch (error) {
      const payload =
        error instanceof AppError
          ? (() => {
              const body = error.getResponse() as { code?: string; message?: string };
              return {
                code: error.code,
                message: typeof body.message === 'string' ? body.message : 'Job queue is unavailable',
              };
            })()
          : { code: ErrorCode.JOB_ENQUEUE_FAILED, message: 'Job queue is unavailable' };
      await this.jobs.fail(tenantId, jobId, payload);
      await this.prisma.publication.updateMany({
        where: {
          id: publicationId,
          tenantId,
          status: { in: [PublicationStatus.PENDING, PublicationStatus.UPLOADING] },
        },
        data: {
          status: PublicationStatus.FAILED,
          errorCode: ErrorCode.JOB_ENQUEUE_FAILED,
          errorMessage: payload.message,
          providerResponseMetadata: {
            retryClass: 'TEMPORARY',
            errorCode: ErrorCode.JOB_ENQUEUE_FAILED,
            status: 'FAILED',
          },
        },
      });
      throw error instanceof AppError ? error : new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
    }
  }

  private async requirePublication(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const publication = await this.prisma.publication.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
      include: { platformAccount: true },
    });
    if (!publication) {
      throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    }
    return publication;
  }

  private async requirePublishableVideo(tenantId: string, workspaceId: string, videoId: string) {
    if (!isUuid(videoId)) {
      throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    }
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, tenantId, workspaceId, deletedAt: null },
    });
    if (!video) {
      throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    }
    if (video.status !== VideoStatus.COMPLETED || !video.outputAssetId) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: video.outputAssetId, tenantId, workspaceId, deletedAt: null },
    });
    if (!asset || asset.type !== AssetType.VIDEO || asset.status !== AssetStatus.READY) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    const outputLink = await this.prisma.assetLink.findFirst({
      where: {
        tenantId,
        videoId: video.id,
        assetId: asset.id,
        role: AssetLinkRole.VIDEO_OUTPUT,
      },
    });
    if (!outputLink) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    let exists = false;
    try {
      exists = await this.storage.exists(asset.storageKey);
    } catch {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    if (!exists) {
      throw new AppError(ErrorCode.VIDEO_CONFLICT);
    }
    return video;
  }

  private async present(
    publication: Parameters<typeof toPublicPublication>[0] & { platformAccount?: Parameters<typeof toPublicPublication>[1] },
    account?: Parameters<typeof toPublicPublication>[1],
  ): Promise<PublicationPublic> {
    let sourceVideoTitle: string | null = null;
    if (publication.videoId) {
      const video = await this.prisma.video.findFirst({
        where: { id: publication.videoId, deletedAt: null },
        select: { scriptId: true },
      });
      if (video?.scriptId) {
        const script = await this.prisma.script.findFirst({
          where: { id: video.scriptId, deletedAt: null },
          select: { title: true },
        });
        sourceVideoTitle = script?.title ?? null;
      }
    }
    return toPublicPublication(publication, account ?? null, { sourceVideoTitle });
  }

  private async requireCurrentFinalAcceptance(
    tenantId: string,
    video: { id: string; status: VideoStatus },
  ) {
    const acceptance = await this.prisma.videoFinalAcceptance.findFirst({
      where: { tenantId, videoId: video.id, current: true },
    });
    if (!acceptance || !isCurrentVerticalAcceptance(acceptance)) {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    if (
      !canUseVideoAsManualPublicationSource({
        videoId: video.id,
        status: video.status,
        acceptance,
      })
    ) {
      throw new AppError(ErrorCode.VIDEO_FINAL_ACCEPTANCE_NOT_AVAILABLE);
    }
    return acceptance;
  }

  private async manualSourcePatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    current: { videoId: string | null; scriptId: string | null; productionArtifactId: string | null },
  ) {
    if (!current.videoId) {
      return {};
    }
    const video = await tx.video.findFirst({
      where: { id: current.videoId, tenantId, deletedAt: null },
      select: { id: true, status: true, scriptId: true },
    });
    if (!video) {
      return {};
    }
    const acceptance = await tx.videoFinalAcceptance.findFirst({
      where: { tenantId, videoId: video.id, current: true },
    });
    if (!acceptance) {
      return {};
    }
    if (
      !canUseVideoAsManualPublicationSource({
        videoId: video.id,
        status: video.status,
        acceptance,
      })
    ) {
      return {};
    }
    const binding = sourceBindingFromAcceptance({
      videoId: video.id,
      scriptId: video.scriptId,
      acceptance,
    });
    return {
      videoId: current.videoId ?? binding.videoId,
      scriptId: current.scriptId ?? binding.scriptId,
      productionArtifactId: current.productionArtifactId ?? binding.productionArtifactId,
    };
  }

  private async requireAccountHint(
    tenantId: string,
    workspaceId: string,
    accountId: string,
    platform: Platform,
  ) {
    if (!isUuid(accountId)) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    const account = await this.prisma.platformAccount.findFirst({
      where: { id: accountId, tenantId, workspaceId, deletedAt: null },
    });
    if (!account) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    if (account.platform !== platform) {
      throw new AppError(ErrorCode.PUBLISH_PLATFORM_MISMATCH);
    }
    return account;
  }

  private async requireActiveAccount(
    tenantId: string,
    workspaceId: string,
    accountId: string,
    platform: Platform,
  ) {
    if (!isUuid(accountId)) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    const account = await this.prisma.platformAccount.findFirst({
      where: { id: accountId, tenantId, workspaceId, deletedAt: null },
    });
    if (!account) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    if (account.platform !== platform) {
      throw new AppError(ErrorCode.PUBLISH_PLATFORM_MISMATCH);
    }
    if (account.status !== PlatformAccountStatus.ACTIVE) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_INACTIVE);
    }
    return account;
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
  }
}

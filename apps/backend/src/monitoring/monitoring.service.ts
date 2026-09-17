import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  ManualExportDestinationType,
  MetricSource,
  MonitoringMode,
  MonitoringRuntimeStatus,
  Platform,
  Prisma,
  PrismaClient,
  PublicationMode,
  PublicationRegistrationSource,
  PublicationStatus,
  PublicationVerificationStatus,
  PublishedPostLifecycleStatus,
} from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { defaultDouyinPublicationCandidate, requireAcceptedArtifact } from './accepted-artifact.gate.js';
import { parseDouyinPostUrl, parsePlatformPostId } from './douyin-post-url-parser.js';
import { buildMonitoringHandoffV1, buildPerformanceAnalysisInputV1 } from './monitoring-handoff.js';
import { monitoringReadyAfterRegistration } from './manual-publication.workflow.js';
import { ManualPostMonitoringProviderV1 } from './post-monitoring.provider.js';
import { computeMetricTrend, validateManualMetricsSnapshotV1 } from './post-metrics.validation.js';
import { duplicatePostKey } from './publication-strategy.js';

void duplicatePostKey;

@Injectable()
export class MonitoringService {
  private readonly manualProvider = new ManualPostMonitoringProviderV1();

  constructor(private readonly prisma: PrismaClient) {}

  async projectStatus(auth: AuthContext, projectId: string) {
    await this.requireProject(auth, projectId);
    const candidate = defaultDouyinPublicationCandidate();
    const post = await this.prisma.publication.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        projectId,
        productionArtifactId: candidate.artifactId,
        mode: PublicationMode.MANUAL,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      schemaVersion: 'manual.publication.project-status:v1',
      finalProductionAcceptance: 'ACCEPTED',
      publishMode: 'MANUAL',
      defaultArtifact: {
        artifactId: candidate.artifactId,
        sha256: candidate.sha256,
        orientation: candidate.orientation,
        acceptance: candidate.acceptance,
      },
      landscapeExportable: true,
      publicationState: post
        ? post.lifecycleStatus
        : 'AWAITING_MANUAL_PUBLICATION',
      registration: post ? 'REGISTERED' : 'NOT_REGISTERED_AS_PUBLISHED',
      monitoring: post?.monitoringStatus === MonitoringRuntimeStatus.READY ||
        post?.monitoringStatus === MonitoringRuntimeStatus.ACTIVE
        ? post.monitoringStatus
        : 'WAITING_REGISTRATION',
      copy: {
        cta: '下载/导出竖版成片',
        hint: '发布到抖音后，将作品链接粘贴回来，即可继续数据监控与AI复盘。',
        modeLabel: '导出并手动发布',
      },
      content01: projectId === candidate.projectId
        ? {
            finalAccepted: true,
            manualExportReady: true,
            notRegisteredAsPublished: !post,
            awaitingManualPublication: true,
          }
        : null,
    };
  }

  async recordExport(auth: AuthContext, projectId: string, artifactId?: string, destinationType?: 'DOWNLOAD' | 'USER_CHOSEN') {
    const project = await this.requireProject(auth, projectId);
    const artifact = requireAcceptedArtifact(artifactId ?? defaultDouyinPublicationCandidate().artifactId);
    const row = await this.prisma.manualPublicationExport.create({
      data: {
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        artifactId: artifact.artifactId,
        artifactSha: artifact.sha256,
        destinationType: destinationType === 'USER_CHOSEN' ? ManualExportDestinationType.USER_CHOSEN : ManualExportDestinationType.DOWNLOAD,
        createdByUserId: auth.userId,
      },
    });
    return {
      exportId: row.id,
      artifactId: row.artifactId,
      artifactSHA: row.artifactSha,
      exportedAt: row.exportedAt.toISOString(),
      destinationType: row.destinationType,
      status: row.status,
    };
  }

  async openExportFile(auth: AuthContext, projectId: string, artifactId?: string) {
    await this.requireProject(auth, projectId);
    const artifact = requireAcceptedArtifact(artifactId ?? defaultDouyinPublicationCandidate().artifactId);
    const abs = resolveArtifactPath(artifact.relativePath);
    if (!existsSync(abs)) {
      throw new AppError(ErrorCode.VIDEO_EXPORT_NOT_AVAILABLE);
    }
    return {
      stream: createReadStream(abs),
      filename: path.basename(artifact.relativePath),
      artifact,
    };
  }

  async register(auth: AuthContext, projectId: string, dto: {
    artifactId?: string;
    platformUrl?: string;
    platformPostId?: string;
    publishedAt?: string;
    videoId?: string;
    scriptId?: string;
    contentPlanId?: string;
    idempotencyKey: string;
  }) {
    const project = await this.requireProject(auth, projectId);
    const artifact = requireAcceptedArtifact(dto.artifactId ?? defaultDouyinPublicationCandidate().artifactId);
    let platformUrl = dto.platformUrl?.trim() || null;
    let platformPostId = dto.platformPostId?.trim() ? parsePlatformPostId(dto.platformPostId) : null;
    let verification: PublicationVerificationStatus = PublicationVerificationStatus.USER_ASSERTED;
    let registrationSource: PublicationRegistrationSource = PublicationRegistrationSource.USER_ENTERED_POST_ID;

    if (platformUrl) {
      const parsed = parseDouyinPostUrl(platformUrl);
      if (parsed.status === 'SHORT_LINK_RESOLUTION_REQUIRED' && !platformPostId) {
        throw new AppError(ErrorCode.SHORT_LINK_RESOLUTION_REQUIRED);
      }
      if (parsed.status === 'FORMAT_VALIDATED') {
        platformUrl = parsed.normalizedUrl;
        platformPostId = platformPostId ?? parsed.platformPostId;
        verification = PublicationVerificationStatus.FORMAT_VALIDATED;
        registrationSource = PublicationRegistrationSource.USER_PASTED_URL;
      } else if (parsed.status === 'UNSUPPORTED_HOST' || parsed.status === 'INVALID') {
        if (!platformPostId) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'URL could not be parsed');
        }
        registrationSource = PublicationRegistrationSource.USER_ENTERED_POST_ID;
      }
    } else if (platformPostId) {
      registrationSource = PublicationRegistrationSource.USER_ENTERED_POST_ID;
    }

    if (!platformUrl && !platformPostId) {
      throw new AppError(ErrorCode.PUBLISHED_POST_IDENTITY_REQUIRED);
    }

    const targetCheck = this.manualProvider.validateTarget({ platformPostId, platformUrl });
    if (!targetCheck.ok) {
      throw new AppError(ErrorCode.PUBLISHED_POST_IDENTITY_REQUIRED);
    }

    if (
      verification !== PublicationVerificationStatus.USER_ASSERTED &&
      verification !== PublicationVerificationStatus.FORMAT_VALIDATED
    ) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'PLATFORM_VERIFIED is not allowed in V1');
    }

    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'publishedAt is invalid');
    }

    const ready = monitoringReadyAfterRegistration({
      registered: true,
      platformPostId,
      platformUrl,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await tx.publication.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: auth.tenantId, idempotencyKey: dto.idempotencyKey } },
        });
        if (existingKey) {
          return this.toPublic(existingKey);
        }
        if (platformPostId) {
          const dup = await tx.publication.findFirst({
            where: {
              tenantId: auth.tenantId,
              platform: Platform.DOUYIN,
              externalPostId: platformPostId,
            },
          });
          if (dup) {
            throw new AppError(ErrorCode.PUBLISHED_POST_DUPLICATE);
          }
        }
        const created = await tx.publication.create({
          data: {
            tenantId: project.tenantId,
            workspaceId: project.workspaceId,
            projectId: project.id,
            videoId: dto.videoId ?? null,
            contentPlanId: dto.contentPlanId ?? null,
            scriptId: dto.scriptId ?? artifact.scriptId,
            productionArtifactId: artifact.artifactId,
            artifactSha: artifact.sha256,
            platform: Platform.DOUYIN,
            mode: PublicationMode.MANUAL,
            status: PublicationStatus.PUBLISHED,
            lifecycleStatus: ready
              ? PublishedPostLifecycleStatus.MONITORING_READY
              : PublishedPostLifecycleStatus.REGISTERED,
            registrationSource,
            verificationStatus: verification,
            monitoringStatus: ready ? MonitoringRuntimeStatus.READY : MonitoringRuntimeStatus.WAITING_REGISTRATION,
            monitoringMode: MonitoringMode.MANUAL_IMPORT,
            registeredAt: new Date(),
            publishedAt,
            externalPostId: platformPostId,
            externalUrl: platformUrl,
            title: '手动发布作品',
            visibility: 'PUBLIC',
            idempotencyKey: dto.idempotencyKey,
            createdByUserId: auth.userId,
            metadataSnapshot: {
              publishMode: 'MANUAL',
              platformVerified: false,
              fakePost: false,
            },
          },
        });
        const handoff = buildMonitoringHandoffV1({
          publishedPostId: created.id,
          platformPostId,
          platformUrl,
          artifactId: artifact.artifactId,
          scriptId: created.scriptId,
          contentPlanId: created.contentPlanId,
          registeredAt: created.registeredAt ?? new Date(),
        });
        await tx.monitoringTarget.create({
          data: {
            tenantId: created.tenantId,
            workspaceId: created.workspaceId,
            projectId: created.projectId,
            publishedPostId: created.id,
            platform: Platform.DOUYIN,
            platformPostId,
            platformUrl,
            artifactId: artifact.artifactId,
            scriptId: created.scriptId,
            contentPlanId: created.contentPlanId,
            registeredAt: created.registeredAt ?? new Date(),
            monitoringMode: MonitoringMode.MANUAL_IMPORT,
          },
        });
        return { ...this.toPublic(created), handoff };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ErrorCode.PUBLISHED_POST_DUPLICATE);
      }
      throw error;
    }
  }

  async list(auth: AuthContext, projectId?: string) {
    const workspaceId = resolveWorkspaceId(auth);
    const posts = await this.prisma.publication.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        ...(projectId ? { projectId } : {}),
        OR: [{ productionArtifactId: { not: null } }, { videoId: { not: null } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        metricSnapshots: { orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }], take: 1 },
      },
    });
    return {
      items: posts.map((post) => {
        const latest = post.metricSnapshots[0];
        return {
          ...this.toPublic(post),
          latestMetrics: latest
            ? {
                playCount: latest.views,
                likeCount: latest.likes,
                commentCount: latest.comments,
                shareCount: latest.shares,
                collectCount: latest.favorites,
                capturedAt: latest.observedAt.toISOString(),
              }
            : null,
        };
      }),
    };
  }

  async getById(auth: AuthContext, id: string) {
    const post = await this.requirePost(auth, id);
    const snapshots = await this.prisma.publicationMetricSnapshot.findMany({
      where: { tenantId: auth.tenantId, publicationId: post.id },
      orderBy: [{ observedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const trends = [];
    for (let i = 1; i < snapshots.length; i += 1) {
      const prev = snapshots[i - 1];
      const cur = snapshots[i];
      const intervalMs = cur.observedAt.getTime() - prev.observedAt.getTime();
      trends.push({
        from: prev.id,
        to: cur.id,
        play: computeMetricTrend(prev.views, cur.views, intervalMs),
        like: computeMetricTrend(prev.likes, cur.likes, intervalMs),
      });
    }
    const latest = snapshots.at(-1) ?? null;
    return {
      post: this.toPublic(post),
      verification: {
        userAsserted: post.verificationStatus !== PublicationVerificationStatus.PLATFORM_VERIFIED,
        formatValidated: post.verificationStatus === PublicationVerificationStatus.FORMAT_VALIDATED,
        platformVerified: false,
      },
      snapshots: snapshots.map((row) => ({
        id: row.id,
        capturedAt: row.observedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        enteredByUserId: row.enteredByUserId,
        source: row.source,
        playCount: row.views,
        likeCount: row.likes,
        commentCount: row.comments,
        shareCount: row.shares,
        collectCount: row.favorites,
        followerDelta: row.newFollowers,
      })),
      latestMetrics: latest
        ? {
            playCount: latest.views,
            likeCount: latest.likes,
            commentCount: latest.comments,
            shareCount: latest.shares,
            collectCount: latest.favorites,
            capturedAt: latest.observedAt.toISOString(),
          }
        : null,
      trends,
      performanceAnalysisInput: buildPerformanceAnalysisInputV1({
        publishedPostId: post.id,
        platformPostId: post.externalPostId,
        platformUrl: post.externalUrl,
        artifactId: post.productionArtifactId ?? '',
        artifactSha: post.artifactSha,
        metricsSnapshots: snapshots.map((row) => ({ id: row.id, observedAt: row.observedAt })),
        feedbackCycleId: post.feedbackCycleId,
      }),
    };
  }

  async addMetrics(auth: AuthContext, publishedPostId: string, dto: {
    playCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    shareCount?: number | null;
    collectCount?: number | null;
    followerDelta?: number | null;
    capturedAt?: string;
    idempotencyKey: string;
  }) {
    const post = await this.requirePost(auth, publishedPostId);
    if (
      post.lifecycleStatus !== PublishedPostLifecycleStatus.MONITORING_READY &&
      post.lifecycleStatus !== PublishedPostLifecycleStatus.MONITORING_ACTIVE &&
      post.lifecycleStatus !== PublishedPostLifecycleStatus.REGISTERED
    ) {
      throw new AppError(ErrorCode.MONITORING_NOT_READY);
    }
    if (!post.externalPostId && !post.externalUrl) {
      throw new AppError(ErrorCode.PUBLISHED_POST_IDENTITY_REQUIRED);
    }
    const metrics = validateManualMetricsSnapshotV1(dto);
    this.manualProvider.acceptUserSnapshot();
    const created = await this.prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: post.tenantId,
        workspaceId: post.workspaceId,
        projectId: post.projectId,
        publicationId: post.id,
        platform: post.platform,
        source: MetricSource.MANUAL,
        collectionKey: `manual:${dto.idempotencyKey}`,
        observedAt: metrics.capturedAt,
        views: metrics.playCount,
        likes: metrics.likeCount,
        comments: metrics.commentCount,
        shares: metrics.shareCount,
        favorites: metrics.collectCount,
        newFollowers: metrics.followerDelta,
        provider: 'manual-post-monitoring:v1',
        enteredByUserId: auth.userId,
        providerMetadata: { source: 'MANUAL_ENTRY', fake: false },
      },
    });
    await this.prisma.performanceAnalysis.updateMany({
      where: { tenantId: auth.tenantId, publishedPostId: post.id, status: 'ACTIVE' },
      data: { status: 'STALE_BY_NEWER_METRICS' },
    });
    if (post.lifecycleStatus === PublishedPostLifecycleStatus.MONITORING_READY) {
      await this.prisma.publication.update({
        where: { id_tenantId: { id: post.id, tenantId: auth.tenantId } },
        data: {
          lifecycleStatus: PublishedPostLifecycleStatus.MONITORING_ACTIVE,
          monitoringStatus: MonitoringRuntimeStatus.ACTIVE,
        },
      });
    }
    return {
      id: created.id,
      publishedPostId: post.id,
      capturedAt: created.observedAt.toISOString(),
      createdAt: created.createdAt.toISOString(),
      enteredByUserId: created.enteredByUserId,
      source: 'MANUAL_ENTRY',
      playCount: created.views,
      likeCount: created.likes,
      commentCount: created.comments,
      shareCount: created.shares,
      collectCount: created.favorites,
      followerDelta: created.newFollowers,
      appendOnly: true,
    };
  }

  private async requireProject(auth: AuthContext, projectId: string) {
    if (!isUuid(projectId)) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const workspaceId = resolveWorkspaceId(auth);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    return project;
  }

  private async requirePost(auth: AuthContext, id: string) {
    if (!isUuid(id)) throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    const workspaceId = resolveWorkspaceId(auth);
    const post = await this.prisma.publication.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!post) throw new AppError(ErrorCode.PUBLICATION_NOT_FOUND);
    return post;
  }

  private toPublic(post: {
    id: string;
    tenantId: string;
    workspaceId: string;
    projectId: string;
    videoId: string | null;
    contentPlanId: string | null;
    scriptId: string | null;
    productionArtifactId: string | null;
    artifactSha: string | null;
    platform: Platform;
    mode: PublicationMode;
    lifecycleStatus: PublishedPostLifecycleStatus;
    registrationSource: PublicationRegistrationSource | null;
    verificationStatus: PublicationVerificationStatus | null;
    monitoringStatus: MonitoringRuntimeStatus;
    monitoringMode: MonitoringMode;
    publishedAt: Date | null;
    registeredAt: Date | null;
    externalPostId: string | null;
    externalUrl: string | null;
    feedbackCycleId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: post.id,
      tenantId: post.tenantId,
      workspaceId: post.workspaceId,
      projectId: post.projectId,
      videoId: post.videoId,
      contentPlanId: post.contentPlanId,
      scriptId: post.scriptId,
      productionArtifactId: post.productionArtifactId,
      artifactSha: post.artifactSha,
      platform: post.platform,
      publishMode: post.mode === PublicationMode.API ? 'OFFICIAL_API' : post.mode === PublicationMode.SCHEDULED_API ? 'SCHEDULED_API' : 'MANUAL',
      status: post.lifecycleStatus,
      registrationSource: post.registrationSource,
      verificationStatus: post.verificationStatus,
      platformVerified: false,
      monitoringStatus: post.monitoringStatus,
      monitoringMode: post.monitoringMode,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      registeredAt: post.registeredAt?.toISOString() ?? null,
      platformPostId: post.externalPostId,
      platformUrl: post.externalUrl,
      feedbackCycleId: post.feedbackCycleId,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}

function resolveArtifactPath(relativePath: string): string {
  const repo =
    process.env.ACF_REPO_ROOT?.trim() ||
    process.env.CROP_REVIEW_REPO_ROOT?.trim() ||
    (path.basename(process.cwd()) === 'backend' ? path.resolve(process.cwd(), '..', '..') : process.cwd());
  return path.resolve(repo, relativePath);
}

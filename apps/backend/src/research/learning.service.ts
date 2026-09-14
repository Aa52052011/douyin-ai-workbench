import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, StrategyRecommendationStatus } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { PerformanceFeedbackService } from '../metrics/performance-feedback.service.js';
import {
  bridgeLearningSignalsToMemory,
  buildLearningSignalsFromPerformanceFeedback,
  learningStatusLabel,
  learningWatermark,
  recommendationsFromSignals,
  toPublicLearningView,
  type LearningSignal,
} from './learning-signals.js';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly feedback: PerformanceFeedbackService,
  ) {}

  async summarize(auth: AuthContext, projectId: string, workspaceHint?: string) {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const started = Date.now();
    const strategyBefore = await this.prisma.campaignStrategy.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, payload: true },
    });
    const feedback = await this.feedback.buildForProject({
      tenantId: auth.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
    });
    const patternMap = await this.referencePatternsByPublication(auth.tenantId, project.id, feedback.positiveSignals.flatMap((item) => item.publicationIds));
    const signals = buildLearningSignalsFromPerformanceFeedback(feedback, { referencePatternByPublication: patternMap });
    const recommendations = recommendationsFromSignals(signals);
    const watermark = learningWatermark(feedback);
    await this.persistRecommendation(project, watermark, {
      recommendations,
      sampleSize: feedback.sampleSize,
      generatedAt: feedback.generatedAt,
    });
    const strategyAfter = await this.prisma.campaignStrategy.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id, id: strategyBefore?.id },
      select: { version: true, payload: true },
    });
    if (strategyBefore && strategyAfter) {
      void strategyAfter;
    }
    const confirmed = signals.filter((item) => item.status === 'confirmed');
    const candidate = signals.filter((item) => item.status === 'candidate');
    const statusLabel = learningStatusLabel({
      sampleSize: feedback.sampleSize,
      confirmed: confirmed.length,
      candidate: candidate.length,
    });
    this.logger.log(
      JSON.stringify({
        projectId: project.id,
        sourceWatermark: watermark,
        publicationCount: feedback.publicationsConsidered,
        metricSnapshotCount: feedback.sampleSize,
        confirmedSignalCount: confirmed.length,
        candidateSignalCount: candidate.length,
        recommendationCount: recommendations.length,
        durationMs: Date.now() - started,
        strategyUnchanged: true,
      }),
    );
    return toPublicLearningView({
      statusLabel,
      summaries: signals.slice(0, 5).map((item) => item.summary),
      nextBatchAdjustments: recommendations.map((item) => actionLabel(item.action)),
      dataSufficiency: feedback.dataState === 'NONE' ? 'INSUFFICIENT_DATA' : feedback.dataState,
      lastUpdatedAt: feedback.generatedAt,
    });
  }

  async buildNextBatchLearningContext(auth: AuthContext, projectId: string, workspaceHint?: string) {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const feedback = await this.feedback.buildForProject({
      tenantId: auth.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
    });
    const signals = buildLearningSignalsFromPerformanceFeedback(feedback);
    const latest = await this.prisma.strategyAdjustmentRecommendation.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id, status: StrategyRecommendationStatus.ACTIVE },
      orderBy: { version: 'desc' },
    });
    const recentPlan = await this.prisma.contentPlan.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true },
    });
    return {
      confirmed: signals.filter((item) => item.status === 'confirmed').map(compactSignal),
      candidate: signals.filter((item) => item.status === 'candidate').map(compactSignal),
      latestRecommendations: publicRecommendationPayload(latest?.payload),
      recentBatchPerformance: {
        planId: recentPlan?.id,
        title: recentPlan?.title,
        sampleSize: feedback.sampleSize,
        publicationsConsidered: feedback.publicationsConsidered,
      },
    };
  }

  memoryBridge(signals: LearningSignal[]) {
    return bridgeLearningSignalsToMemory(signals);
  }

  private async persistRecommendation(
    project: { id: string; tenantId: string; workspaceId: string },
    watermark: string,
    payload: unknown,
  ) {
    const existing = await this.prisma.strategyAdjustmentRecommendation.findUnique({
      where: {
        tenantId_projectId_sourceWatermark: {
          tenantId: project.tenantId,
          projectId: project.id,
          sourceWatermark: watermark,
        },
      },
    });
    if (existing) {
      return existing;
    }
    const last = await this.prisma.strategyAdjustmentRecommendation.findFirst({
      where: { tenantId: project.tenantId, projectId: project.id },
      orderBy: { version: 'desc' },
    });
    if (last?.status === StrategyRecommendationStatus.ACTIVE) {
      await this.prisma.strategyAdjustmentRecommendation.update({
        where: { id_tenantId: { id: last.id, tenantId: project.tenantId } },
        data: { status: StrategyRecommendationStatus.SUPERSEDED },
      });
    }
    return this.prisma.strategyAdjustmentRecommendation.create({
      data: {
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        version: (last?.version ?? 0) + 1,
        status: StrategyRecommendationStatus.ACTIVE,
        payload: payload as Prisma.InputJsonValue,
        sourceWatermark: watermark,
      },
    });
  }

  private async referencePatternsByPublication(tenantId: string, projectId: string, publicationIds: string[]) {
    if (!publicationIds.length) {
      return {};
    }
    const publications = await this.prisma.publication.findMany({
      where: { tenantId, projectId, id: { in: publicationIds } },
      select: { id: true, videoId: true },
    });
    const videoIds = publications.map((item) => item.videoId).filter((id): id is string => Boolean(id));
    if (!videoIds.length) {
      return {};
    }
    const videos = await this.prisma.video.findMany({
      where: { tenantId, projectId, id: { in: videoIds } },
      select: { id: true, scriptId: true },
    });
    const scriptIds = videos.map((item) => item.scriptId).filter((id): id is string => Boolean(id));
    const scripts = scriptIds.length
      ? await this.prisma.script.findMany({
          where: { tenantId, projectId, id: { in: scriptIds } },
          select: { id: true, payload: true },
        })
      : [];
    const scriptPatterns = new Map<string, string[]>();
    for (const script of scripts) {
      const payload = script.payload as { referencePatternIds?: unknown };
      const ids = Array.isArray(payload.referencePatternIds)
        ? payload.referencePatternIds.filter((item): item is string => typeof item === 'string')
        : [];
      scriptPatterns.set(script.id, ids);
    }
    const videoScript = new Map(videos.map((item) => [item.id, item.scriptId]));
    const map: Record<string, string[]> = {};
    for (const publication of publications) {
      const scriptId = publication.videoId ? videoScript.get(publication.videoId) : undefined;
      map[publication.id] = scriptId ? scriptPatterns.get(scriptId) ?? [] : [];
    }
    return map;
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

function compactSignal(signal: LearningSignal) {
  return {
    key: signal.key,
    summary: signal.summary,
    supportCount: signal.supportCount,
    status: signal.status,
  };
}

function publicRecommendationPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const recs = (payload as { recommendations?: Array<{ action?: string; rationale?: string }> }).recommendations;
  if (!Array.isArray(recs)) {
    return [];
  }
  return recs.map((item) => ({
    actionLabel: actionLabel(String(item.action ?? 'KEEP')),
    rationale: item.rationale ?? '',
  }));
}

function actionLabel(action: string): string {
  switch (action) {
    case 'INCREASE':
      return '下一批适当增加类似内容';
    case 'DECREASE':
      return '下一批谨慎减少类似内容';
    case 'AVOID':
      return '下一批减少该类内容';
    case 'TEST_MORE':
      return '下一批小范围再试';
    case 'REFRESH_STRATEGY':
      return '建议重新审视策略（不会自动改已确认版本）';
    default:
      return '保持当前方向';
  }
}

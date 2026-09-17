import { AgentRunStatus, Prisma, PrismaClient } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import {
  PERFORMANCE_ANALYSIS_AGENT_ID,
  PERFORMANCE_ANALYSIS_AGENT_VERSION,
} from '../agents/agent.types.js';
import {
  applyRecommendationReview,
  mergePersistedRecommendations,
  buildNextContentPlanningFeedback,
  feedbackStatusFromRecommendations,
  neverMutateContentPlan,
  runDeterministicPerformanceAnalysis,
  type NextContentPlanningFeedbackV1,
  type PerformanceAnalysisInputV1,
} from './performance-analysis.engine.js';
import {
  collectAcceptedPerformanceFeedback,
  type AcceptedPerformanceFeedbackItemV1,
  type ActionableRecommendationV1,
} from './actionable-recommendation.mapper.js';
import type { AnalysisWindowKind, RecommendationReviewAction } from './performance-analysis.types.js';

@Injectable()
export class PerformanceAnalysisService {
  constructor(private readonly prisma: PrismaClient) {}

  async analyze(
    auth: AuthContext,
    publishedPostId: string,
    dto: { analysisWindow?: AnalysisWindowKind; force?: boolean },
  ) {
    const post = await this.requirePost(auth, publishedPostId);
    const window: AnalysisWindowKind = dto.analysisWindow ?? 'LATEST_ONLY';
    const snapshots = await this.prisma.publicationMetricSnapshot.findMany({
      where: { tenantId: auth.tenantId, publicationId: post.id },
      orderBy: { observedAt: 'asc' },
    });
    const script = post.scriptId
      ? await this.prisma.script.findFirst({ where: { id: post.scriptId, tenantId: auth.tenantId } })
      : null;
    const plan = post.contentPlanId
      ? await this.prisma.contentPlan.findFirst({ where: { id: post.contentPlanId, tenantId: auth.tenantId } })
      : null;
    const input: PerformanceAnalysisInputV1 = {
      schemaVersion: 'performance.analysis-input:v1',
      tenantId: post.tenantId,
      workspaceId: post.workspaceId,
      projectId: post.projectId,
      publishedPostId: post.id,
      contentPlanSnapshot: plan ? { id: plan.id, title: plan.title } : { title: '' },
      scriptSnapshot: script ? { id: script.id, title: script.title } : { title: '' },
      artifactSnapshot: { artifactId: post.productionArtifactId, sha256: post.artifactSha },
      publicationSnapshot: {
        id: post.id,
        platform: post.platform,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        platformPostId: post.externalPostId,
        platformUrl: post.externalUrl,
      },
      metricsSnapshots: snapshots.map((row) => ({
        id: row.id,
        publishedPostId: post.id,
        capturedAt: row.observedAt.toISOString(),
        source: mapSource(row.source),
        playCount: row.views,
        likeCount: row.likes,
        commentCount: row.comments,
        shareCount: row.shares,
        collectCount: row.favorites,
        followerDelta: row.newFollowers,
        fixture: false,
      })),
      analysisWindow: window,
      previousComparablePosts: [],
    };
    const computed = this.computeAnalysis(input);
    if (!dto.force) {
      const existing = await this.prisma.performanceAnalysis.findFirst({
        where: {
          tenantId: auth.tenantId,
          publishedPostId: post.id,
          analysisWindow: window,
          analysisVersion: 'v1',
          inputSnapshotHash: computed.inputSnapshotHash,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return this.toPublic(existing);
      }
    }
    const now = new Date();
    const run = await this.prisma.agentRun.create({
      data: {
        tenantId: post.tenantId,
        workspaceId: post.workspaceId,
        projectId: post.projectId,
        agentId: PERFORMANCE_ANALYSIS_AGENT_ID,
        agentVersion: PERFORMANCE_ANALYSIS_AGENT_VERSION,
        status: AgentRunStatus.COMPLETED,
        input: input as unknown as Prisma.InputJsonValue,
        output: computed as unknown as Prisma.InputJsonValue,
        requestId: randomUUID(),
        startedAt: now,
        completedAt: now,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    });
    const analysis = await this.prisma.performanceAnalysis.create({
      data: {
        tenantId: post.tenantId,
        workspaceId: post.workspaceId,
        projectId: post.projectId,
        publishedPostId: post.id,
        agentRunId: run.id,
        analysisWindow: window,
        analysisVersion: 'v1',
        inputSnapshotHash: computed.inputSnapshotHash,
        inputSnapshot: input as unknown as Prisma.InputJsonValue,
        metricsSummary: computed.metricsSummary as unknown as Prisma.InputJsonValue,
        findings: computed.findings as unknown as Prisma.InputJsonValue,
        recommendations: computed.recommendations as unknown as Prisma.InputJsonValue,
        benchmarkContext: computed.benchmarkContext,
        dataSufficiency: computed.dataSufficiency,
        confidenceSummary: computed.confidenceSummary as unknown as Prisma.InputJsonValue,
        windowCoverage: computed.metricsSummary.windowCoverage,
        status: 'ACTIVE',
        llmInvoked: false,
        fixture: computed.fixture,
      },
    });
    await this.prisma.contentFeedbackCycle.create({
      data: {
        tenantId: post.tenantId,
        workspaceId: post.workspaceId,
        projectId: post.projectId,
        sourcePublishedPostId: post.id,
        analysisId: analysis.id,
        recommendations: computed.recommendations as unknown as Prisma.InputJsonValue,
        status: 'HUMAN_REVIEW_REQUIRED',
        appliedToNextPlan: false,
      },
    });
    return this.toPublic(analysis);
  }

  async list(auth: AuthContext, publishedPostId: string) {
    await this.requirePost(auth, publishedPostId);
    let rows = await this.prisma.performanceAnalysis.findMany({
      where: { tenantId: auth.tenantId, publishedPostId },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) {
      const metricCount = await this.prisma.publicationMetricSnapshot.count({
        where: { tenantId: auth.tenantId, publicationId: publishedPostId },
      });
      if (metricCount > 0) {
        try {
          await this.analyze(auth, publishedPostId, { analysisWindow: 'LATEST_ONLY', force: false });
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            error instanceof Error ? error.message : 'performance analysis persist failed',
          );
        }
        rows = await this.prisma.performanceAnalysis.findMany({
          where: { tenantId: auth.tenantId, publishedPostId },
          orderBy: { createdAt: 'desc' },
        });
      }
    }
    return { items: rows.map((row) => this.toPublic(row)) };
  }

  async getById(auth: AuthContext, analysisId: string) {
    const row = await this.requireAnalysis(auth, analysisId);
    const cycle = await this.prisma.contentFeedbackCycle.findFirst({
      where: { tenantId: auth.tenantId, analysisId: row.id },
      orderBy: { createdAt: 'desc' },
    });
    const recommendations = mergePersistedRecommendations(row.recommendations, cycle?.recommendations);
    return { ...this.toPublic(row), recommendations, feedbackCycle: cycle };
  }

  async reviewRecommendation(
    auth: AuthContext,
    analysisId: string,
    recommendationId: string,
    action: RecommendationReviewAction,
    userNote?: string | null,
  ) {
    const row = await this.requireAnalysis(auth, analysisId);
    const post = await this.requirePost(auth, row.publishedPostId);
    const planBefore = post.contentPlanId
      ? await this.prisma.contentPlan.findFirst({ where: { tenantId: auth.tenantId, id: post.contentPlanId } })
      : null;
    const recs = applyRecommendationReview(
      (row.recommendations as unknown as ActionableRecommendationV1[]) ?? [],
      recommendationId,
      action,
      { reviewedBy: auth.userId, userNote: userNote ?? null },
    );
    const status = feedbackStatusFromRecommendations(recs);
    await this.prisma.performanceAnalysis.update({
      where: { id_tenantId: { id: row.id, tenantId: auth.tenantId } },
      data: { recommendations: recs as unknown as Prisma.InputJsonValue },
    });
    await this.prisma.contentFeedbackCycle.updateMany({
      where: { tenantId: auth.tenantId, analysisId: row.id },
      data: { status, recommendations: recs as unknown as Prisma.InputJsonValue },
    });
    const planAfter = planBefore
      ? await this.prisma.contentPlan.findFirst({ where: { id: planBefore.id, tenantId: auth.tenantId } })
      : null;
    if (planBefore && planAfter) neverMutateContentPlan(planBefore.payload, planAfter.payload);
    return this.getById(auth, analysisId);
  }

  async listAcceptedForProject(
    auth: AuthContext,
    projectId: string,
    workspaceHint?: string,
  ): Promise<{ items: AcceptedPerformanceFeedbackItemV1[]; count: number; referenceOnly: true }> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(projectId)) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId },
    });
    if (!project) throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    const cycles = await this.prisma.contentFeedbackCycle.findMany({
      where: { tenantId: auth.tenantId, workspaceId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
    const items = cycles.flatMap((cycle) =>
      collectAcceptedPerformanceFeedback({
        sourcePublicationId: cycle.sourcePublishedPostId,
        sourceAnalysisId: cycle.analysisId,
        recommendations: (cycle.recommendations as unknown as ActionableRecommendationV1[]) ?? [],
      }),
    );
    return { items, count: items.length, referenceOnly: true };
  }

  async applyFeedback(auth: AuthContext, analysisId: string): Promise<{
    cycleStatus: string;
    appliedToNextPlan: true;
    nextContentPlanningFeedback: NextContentPlanningFeedbackV1;
    contentPlanMutated: false;
  }> {
    const row = await this.requireAnalysis(auth, analysisId);
    const cycle = await this.prisma.contentFeedbackCycle.findFirst({
      where: { tenantId: auth.tenantId, analysisId: row.id },
    });
    if (!cycle) throw new AppError(ErrorCode.FEEDBACK_CYCLE_NOT_FOUND);
    const recs = (cycle.recommendations as unknown as ActionableRecommendationV1[]) ?? [];
    const handoff = buildNextContentPlanningFeedback({
      analysisId: row.id,
      publishedPostId: row.publishedPostId,
      feedbackCycleId: cycle.id,
      recommendations: recs,
    });
    await this.prisma.contentFeedbackCycle.update({
      where: { id_tenantId: { id: cycle.id, tenantId: auth.tenantId } },
      data: {
        status: 'APPLIED_TO_NEXT_PLAN',
        appliedToNextPlan: true,
        appliedAt: new Date(),
        recommendations: recs as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      cycleStatus: 'APPLIED_TO_NEXT_PLAN',
      appliedToNextPlan: true,
      nextContentPlanningFeedback: handoff,
      contentPlanMutated: false,
    };
  }

  async markStaleForPost(tenantId: string, publishedPostId: string): Promise<void> {
    await this.prisma.performanceAnalysis.updateMany({
      where: { tenantId, publishedPostId, status: 'ACTIVE' },
      data: { status: 'STALE_BY_NEWER_METRICS' },
    });
  }

  private toPublic(row: {
    id: string;
    tenantId: string;
    workspaceId: string;
    projectId: string;
    publishedPostId: string;
    agentRunId: string | null;
    analysisWindow: string;
    analysisVersion: string;
    inputSnapshotHash: string;
    metricsSummary: unknown;
    findings: unknown;
    recommendations: unknown;
    benchmarkContext: string;
    dataSufficiency: string;
    confidenceSummary: unknown;
    windowCoverage: string;
    status: string;
    llmInvoked: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      publishedPostId: row.publishedPostId,
      agentRunId: row.agentRunId,
      analysisWindow: row.analysisWindow,
      analysisVersion: row.analysisVersion,
      inputSnapshotHash: row.inputSnapshotHash,
      metricsSummary: row.metricsSummary,
      findings: row.findings,
      recommendations: row.recommendations,
      benchmarkContext: row.benchmarkContext,
      dataSufficiency: row.dataSufficiency,
      confidenceSummary: row.confidenceSummary,
      windowCoverage: row.windowCoverage,
      status: row.status,
      llmInvoked: row.llmInvoked,
      createdAt: row.createdAt.toISOString(),
      agentKey: `${PERFORMANCE_ANALYSIS_AGENT_ID}:${PERFORMANCE_ANALYSIS_AGENT_VERSION}`,
      readyForAnalysisWhenMetricsAvailable: false,
    };
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

  private computeAnalysis(input: PerformanceAnalysisInputV1) {
    try {
      return runDeterministicPerformanceAnalysis(input);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        error instanceof Error ? error.message : 'performance analysis failed',
      );
    }
  }

  private async requireAnalysis(auth: AuthContext, id: string) {
    if (!isUuid(id)) throw new AppError(ErrorCode.PERFORMANCE_ANALYSIS_NOT_FOUND);
    const workspaceId = resolveWorkspaceId(auth);
    const row = await this.prisma.performanceAnalysis.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!row) throw new AppError(ErrorCode.PERFORMANCE_ANALYSIS_NOT_FOUND);
    return row;
  }
}

function mapSource(source: string): string {
  if (source === 'MANUAL') return 'MANUAL_ENTRY';
  if (source === 'IMPORT') return 'MANUAL_IMPORT';
  return source;
}

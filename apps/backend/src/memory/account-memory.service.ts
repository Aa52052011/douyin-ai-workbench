import { Injectable, Logger } from '@nestjs/common';
import {
  AccountMemoryStatus,
  ContentPlanStatus,
  Prisma,
  PrismaClient,
  ScriptStatus,
  VideoStatus,
} from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { normalizeBusinessGoal } from '../common/business-goal.js';
import { PerformanceFeedbackService } from '../metrics/performance-feedback.service.js';
import { REPEATED_SIGNAL_MIN_SUPPORT } from '../metrics/performance-feedback.constants.js';
import { buildLearningSignalsFromPerformanceFeedback } from '../research/learning-signals.js';
import {
  computeSourceWatermark,
  detectRecentContentOverlap,
  DeterministicMemoryRetriever,
  splitPatterns,
  uniqueBounded,
  upsertPattern,
  type PatternAccumulator,
} from './account-memory.helpers.js';
import {
  ACCOUNT_MEMORY_PAYLOAD_VERSION,
  MEMORY_RECENT_LIMITS,
  PATTERN_CONFIRMED_MIN_SUPPORT,
  type AccountMemoryContext,
  type AccountMemoryPayload,
  type MemoryRefreshResult,
  type MemoryRefreshTrigger,
} from './account-memory.types.js';

export type AccountMemoryPublic = {
  id: string;
  projectId: string;
  version: number;
  status: string;
  sourceWatermark: string;
  payload: AccountMemoryPayload;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AccountMemoryService {
  private readonly logger = new Logger(AccountMemoryService.name);
  private readonly retriever = new DeterministicMemoryRetriever();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly feedback: PerformanceFeedbackService,
  ) {}

  async getLatestActive(
    auth: AuthContext,
    projectId: string,
    workspaceHint?: string,
  ): Promise<AccountMemoryPublic | null> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const row = await this.prisma.accountMemorySnapshot.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        status: AccountMemoryStatus.ACTIVE,
      },
      orderBy: { version: 'desc' },
    });
    return row ? toPublic(row) : null;
  }

  /**
   * Read path: return ACTIVE memory, or bootstrap deterministically if missing.
   * Never blocks callers with hard failure for empty projects.
   */
  async getOrBootstrap(
    auth: AuthContext,
    projectId: string,
    workspaceHint?: string,
  ): Promise<AccountMemoryPublic> {
    const existing = await this.getLatestActive(auth, projectId, workspaceHint);
    if (existing) {
      if (await this.isMemoryStale(auth, projectId, existing.sourceWatermark, workspaceHint)) {
        const refreshed = await this.refreshMemorySafe(auth, projectId, 'READ_STALE', workspaceHint);
        if (refreshed) {
          const latest = await this.getLatestActive(auth, projectId, workspaceHint);
          if (latest) return latest;
        }
      }
      return existing;
    }
    const boot = await this.refreshMemorySafe(auth, projectId, 'LAZY_BOOTSTRAP', workspaceHint);
    if (boot) {
      const latest = await this.getLatestActive(auth, projectId, workspaceHint);
      if (latest) return latest;
    }
    const empty = await this.buildMemorySnapshot(auth, projectId, workspaceHint);
    return {
      id: 'virtual',
      projectId,
      version: 0,
      status: AccountMemoryStatus.DRAFT,
      sourceWatermark: empty.meta.watermark,
      payload: empty,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async isMemoryStale(
    auth: AuthContext,
    projectId: string,
    watermark: string,
    workspaceHint?: string,
  ): Promise<boolean> {
    const built = await this.buildMemorySnapshot(auth, projectId, workspaceHint);
    return built.meta.watermark !== watermark;
  }

  async rebuildProjectMemory(
    auth: AuthContext,
    projectId: string,
    workspaceHint?: string,
  ): Promise<MemoryRefreshResult> {
    return this.refreshMemory(auth, projectId, 'MANUAL_REBUILD', workspaceHint);
  }

  /** Best-effort wrapper — never throws to callers. */
  async refreshMemorySafe(
    auth: AuthContext,
    projectId: string,
    trigger: MemoryRefreshTrigger,
    workspaceHint?: string,
  ): Promise<MemoryRefreshResult | null> {
    try {
      return await this.refreshMemory(auth, projectId, trigger, workspaceHint);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'account_memory_refresh_failed',
          projectId,
          trigger,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async refreshMemory(
    auth: AuthContext,
    projectId: string,
    trigger: MemoryRefreshTrigger,
    workspaceHint?: string,
  ): Promise<MemoryRefreshResult> {
    const started = Date.now();
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const payload = await this.buildMemorySnapshot(auth, projectId, workspaceHint);
    const watermark = payload.meta.watermark;

    const current = await this.prisma.accountMemorySnapshot.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        status: AccountMemoryStatus.ACTIVE,
      },
      orderBy: { version: 'desc' },
    });

    if (current && current.sourceWatermark === watermark) {
      const durationMs = Date.now() - started;
      this.logRefresh({
        projectId: project.id,
        trigger,
        oldVersion: current.version,
        newVersion: current.version,
        changed: false,
        durationMs,
      });
      return {
        snapshotId: current.id,
        version: current.version,
        status: current.status,
        created: false,
        sourceWatermark: current.sourceWatermark,
        durationMs,
        trigger,
      };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.accountMemorySnapshot.findFirst({
              where: { tenantId: auth.tenantId, projectId: project.id },
              orderBy: { version: 'desc' },
              select: { version: true },
            });
            const version = (last?.version ?? 0) + 1;
            await tx.accountMemorySnapshot.updateMany({
              where: {
                tenantId: auth.tenantId,
                projectId: project.id,
                status: AccountMemoryStatus.ACTIVE,
              },
              data: { status: AccountMemoryStatus.SUPERSEDED },
            });
            return tx.accountMemorySnapshot.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                version,
                status: AccountMemoryStatus.ACTIVE,
                sourceWatermark: watermark,
                payload: payload as unknown as Prisma.InputJsonValue,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        const durationMs = Date.now() - started;
        this.logRefresh({
          projectId: project.id,
          trigger,
          oldVersion: current?.version ?? null,
          newVersion: created.version,
          changed: true,
          durationMs,
        });
        return {
          snapshotId: created.id,
          version: created.version,
          status: created.status,
          created: true,
          sourceWatermark: created.sourceWatermark,
          durationMs,
          trigger,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate account memory version');
  }

  async getMemoryContext(
    auth: AuthContext,
    projectId: string,
    options?: {
      workspaceHint?: string;
      current?: { topicTitle?: string; contentPillar?: string; contentAngle?: string; hook?: string; topicId?: string };
    },
  ): Promise<AccountMemoryContext> {
    const memory = await this.getOrBootstrap(auth, projectId, options?.workspaceHint);
    return this.toContextView(memory.payload, options?.current);
  }

  toContextView(
    payload: AccountMemoryPayload,
    current?: { topicTitle?: string; contentPillar?: string; contentAngle?: string; hook?: string; topicId?: string },
  ): AccountMemoryContext {
    const overlap = detectRecentContentOverlap({
      recentTitles: payload.contentHistory.recentTitles,
      recentHooks: payload.contentHistory.recentHooks,
      recentAngles: payload.contentHistory.recentAngles,
      publishedTopicIds: payload.contentHistory.publishedTopicIds,
      candidate: current,
    });
    const relevant = this.retriever.relevantFor({ memory: payload, current });

    return {
      primaryGoal: payload.core.businessGoal,
      goalCode: payload.core.goalCode,
      positioning: payload.core.positioningSummary,
      currentStrategy: payload.core.currentStrategySummary,
      recentTopics: payload.contentHistory.recentTopics.slice(0, MEMORY_RECENT_LIMITS.topics),
      recentHooks: uniqueBounded(
        [...relevant.matchingHooks, ...payload.contentHistory.recentHooks],
        MEMORY_RECENT_LIMITS.hooks,
      ),
      recentAngles: uniqueBounded(
        [...relevant.matchingAngles, ...payload.contentHistory.recentAngles],
        MEMORY_RECENT_LIMITS.angles,
      ),
      recentCtas: payload.contentHistory.recentCtas.slice(0, MEMORY_RECENT_LIMITS.ctas),
      winningPatterns: [...relevant.relatedWinning, ...payload.patterns.winningPatterns]
        .slice(0, MEMORY_RECENT_LIMITS.winningPatterns)
        .map((p) => ({ type: p.patternType, summary: p.summary, supportCount: p.supportCount })),
      losingPatterns: [...relevant.relatedLosing, ...payload.patterns.losingPatterns]
        .slice(0, MEMORY_RECENT_LIMITS.losingPatterns)
        .map((p) => ({ type: p.patternType, summary: p.summary, supportCount: p.supportCount })),
      recentPerformanceSignals: payload.performance.recentPerformanceSignals
        .slice(0, MEMORY_RECENT_LIMITS.performanceSignals)
        .map((s) => ({ code: s.code, supportCount: s.supportCount, direction: s.direction })),
      currentDirection: payload.core.contentDirection?.[0],
      currentBatchSummary: payload.contentHistory.recentBatchSummaries[0]
        ? `${payload.contentHistory.recentBatchSummaries[0].title}（${payload.contentHistory.recentBatchSummaries[0].batchSize} 条）`
        : undefined,
      overlapWarnings: overlap.warnings,
    };
  }

  async buildMemorySnapshot(
    auth: AuthContext,
    projectId: string,
    workspaceHint?: string,
  ): Promise<AccountMemoryPayload> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const builtAt = new Date().toISOString();

    const brief = await this.prisma.productBrief.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
      },
      orderBy: { version: 'desc' },
    });

    const strategy = await this.prisma.campaignStrategy.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        status: { in: ['READY', 'CONFIRMED', 'ARCHIVED'] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    const plans = await this.prisma.contentPlan.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        deletedAt: null,
        status: { in: [ContentPlanStatus.CONFIRMED, ContentPlanStatus.ARCHIVED] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      take: MEMORY_RECENT_LIMITS.batches,
      select: {
        id: true,
        title: true,
        payload: true,
        positioningSnapshot: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        version: true,
      },
    });

    const scripts = await this.prisma.script.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        deletedAt: null,
        status: { in: [ScriptStatus.CONFIRMED, ScriptStatus.ARCHIVED] },
      },
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
      take: MEMORY_RECENT_LIMITS.scripts,
      select: {
        id: true,
        topicId: true,
        title: true,
        payload: true,
        topicSnapshot: true,
        updatedAt: true,
        createdAt: true,
        status: true,
      },
    });

    const publications = await this.prisma.publication.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        status: 'PUBLISHED',
      },
      orderBy: { createdAt: 'desc' },
      take: MEMORY_RECENT_LIMITS.publications,
      select: { id: true, createdAt: true, videoId: true },
    });

    const videos = await this.prisma.video.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        deletedAt: null,
        status: VideoStatus.COMPLETED,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, duration: true, updatedAt: true },
    });

    const latestMetric = await this.prisma.publicationMetricSnapshot.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
      },
      orderBy: { observedAt: 'desc' },
      select: { id: true, observedAt: true },
    });

    const briefPayload = asRecord(brief?.payload);
    const goalNorm = normalizeBusinessGoal({
      businessGoal: typeof briefPayload.businessGoal === 'string' ? briefPayload.businessGoal : undefined,
      goalCode: typeof briefPayload.goalCode === 'string' ? briefPayload.goalCode : undefined,
      goalDescription:
        typeof briefPayload.goalDescription === 'string' ? briefPayload.goalDescription : undefined,
    });
    const strategyPayload = asRecord(strategy?.payload);
    const positioning = asRecord(plans[0]?.positioningSnapshot);

    const topics: string[] = [];
    const titles: string[] = [];
    const hooks: string[] = [];
    const angles: string[] = [];
    const ctas: string[] = [];
    const pillars: string[] = [];
    const confirmedScriptIds: string[] = [];
    const publishedTopicIds: string[] = [];
    const patternMap = new Map<string, PatternAccumulator>();

    for (const script of scripts) {
      confirmedScriptIds.push(script.id);
      if (script.topicId) publishedTopicIds.push(script.topicId);
      const payload = asRecord(script.payload);
      const topicSnap = asRecord(script.topicSnapshot);
      const title = (script.title || stringOrUndef(payload.title) || '').trim();
      const hook = stringOrUndef(payload.hook) || stringOrUndef(payload.opening);
      const angle =
        stringOrUndef(payload.coreAngle) ||
        stringOrUndef(topicSnap.contentAngle) ||
        stringOrUndef(payload.angle);
      const cta = stringOrUndef(payload.cta);
      const pillar = stringOrUndef(topicSnap.contentPillar);
      const topicTitle = stringOrUndef(topicSnap.title) || title;
      const observedAt = script.updatedAt.toISOString();

      if (topicTitle) topics.push(topicTitle);
      if (title) titles.push(title);
      if (hook) {
        hooks.push(hook);
        upsertPattern(patternMap, {
          patternType: 'HOOK',
          rawKey: hook,
          summary: `Hook：${hook.slice(0, 80)}`,
          lastObservedAt: observedAt,
          direction: 'NEUTRAL',
        });
      }
      if (angle) {
        angles.push(angle);
        upsertPattern(patternMap, {
          patternType: 'ANGLE',
          rawKey: angle,
          summary: `角度：${angle.slice(0, 80)}`,
          lastObservedAt: observedAt,
          direction: 'NEUTRAL',
        });
      }
      if (cta) {
        ctas.push(cta);
        upsertPattern(patternMap, {
          patternType: 'CTA',
          rawKey: cta,
          summary: `CTA：${cta.slice(0, 80)}`,
          lastObservedAt: observedAt,
          direction: 'NEUTRAL',
        });
      }
      if (pillar) {
        pillars.push(pillar);
        upsertPattern(patternMap, {
          patternType: 'CONTENT_PILLAR',
          rawKey: pillar,
          summary: `内容柱：${pillar.slice(0, 80)}`,
          lastObservedAt: observedAt,
          direction: 'NEUTRAL',
        });
      }
    }

    let feedback;
    try {
      feedback = await this.feedback.buildForProject({
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
      });
    } catch {
      feedback = null;
    }

    const recentPerformanceSignals: AccountMemoryPayload['performance']['recentPerformanceSignals'] = [];
    const winningSignals: AccountMemoryPayload['performance']['winningSignals'] = [];
    const weakSignals: AccountMemoryPayload['performance']['weakSignals'] = [];

    if (feedback) {
      for (const signal of feedback.positiveSignals) {
        recentPerformanceSignals.push({
          code: signal.code,
          category: signal.category,
          supportCount: signal.supportCount,
          confidence: signal.confidence,
          direction: 'POSITIVE',
        });
        upsertPattern(patternMap, {
          patternType: 'PERFORMANCE_SIGNAL',
          rawKey: signal.code,
          summary: `正向信号：${signal.code}`,
          supportCount: signal.supportCount,
          lastObservedAt: feedback.generatedAt,
          direction: 'POSITIVE',
        });
        if (signal.supportCount >= PATTERN_CONFIRMED_MIN_SUPPORT) {
          winningSignals.push({
            code: signal.code,
            supportCount: signal.supportCount,
            confidence: signal.confidence,
          });
        }
      }
      for (const signal of feedback.cautionSignals) {
        recentPerformanceSignals.push({
          code: signal.code,
          category: signal.category,
          supportCount: signal.supportCount,
          confidence: signal.confidence,
          direction: 'NEGATIVE',
        });
        upsertPattern(patternMap, {
          patternType: 'PERFORMANCE_SIGNAL',
          rawKey: signal.code,
          summary: `谨慎信号：${signal.code}`,
          supportCount: signal.supportCount,
          lastObservedAt: feedback.generatedAt,
          direction: 'NEGATIVE',
        });
        if (signal.supportCount >= PATTERN_CONFIRMED_MIN_SUPPORT) {
          weakSignals.push({
            code: signal.code,
            supportCount: signal.supportCount,
            confidence: signal.confidence,
          });
        }
      }
    }

    if (feedback) {
      const learning = buildLearningSignalsFromPerformanceFeedback(feedback);
      for (const signal of learning) {
        upsertPattern(patternMap, {
          patternType: signal.signalType === 'REFERENCE_PATTERN' ? 'PRODUCTION_STYLE' : 'PERFORMANCE_SIGNAL',
          rawKey: `learn:${signal.key}`,
          summary: signal.summary,
          supportCount: signal.supportCount,
          lastObservedAt: signal.lastObservedAt,
          direction: signal.direction === 'NEGATIVE' ? 'NEGATIVE' : 'POSITIVE',
        });
      }
    }

    const split = splitPatterns(patternMap);
    const winningPatterns = split.winningPatterns;
    const losingPatterns = split.losingPatterns;
    // Confirmed NEUTRAL content patterns are not winning/losing; keep as candidates for awareness.
    const candidateSignals = [
      ...split.candidateSignals,
      ...split.confirmedNeutral.map((p) => ({
        patternType: p.patternType,
        key: p.key,
        summary: `${p.summary}（出现 ${p.supportCount} 次）`,
        supportCount: 1 as const,
        lastObservedAt: p.lastObservedAt,
        direction: p.direction,
      })),
    ].slice(0, MEMORY_RECENT_LIMITS.candidateSignals);

    const recentBatchSummaries = plans.map((plan) => {
      const planPayload = asRecord(plan.payload);
      const topicsArr = Array.isArray(planPayload.topics) ? planPayload.topics : [];
      return {
        planId: plan.id,
        title: plan.title,
        batchSize: topicsArr.length,
        confirmedAt: plan.updatedAt.toISOString(),
      };
    });

    const latestPlan = plans[0];
    const latestPlanTopics = Array.isArray(asRecord(latestPlan?.payload).topics)
      ? (asRecord(latestPlan?.payload).topics as Array<Record<string, unknown>>)
      : [];
    const unfinishedTopicIds = latestPlanTopics
      .filter((t) => {
        const id = typeof t.id === 'string' ? t.id : '';
        if (!id) return false;
        return !scripts.some((s) => s.topicId === id);
      })
      .map((t) => String(t.id))
      .slice(0, 20);

    const contentDirections = Array.isArray(strategyPayload.contentDirections)
      ? strategyPayload.contentDirections.filter((x): x is string => typeof x === 'string').slice(0, 6)
      : undefined;

    const watermark = computeSourceWatermark([
      brief?.id,
      brief?.updatedAt?.toISOString(),
      strategy?.id,
      strategy?.createdAt?.toISOString(),
      strategy?.version,
      plans[0]?.id,
      plans[0]?.updatedAt?.toISOString(),
      scripts[0]?.id,
      scripts[0]?.updatedAt?.toISOString(),
      videos[0]?.id,
      videos[0]?.updatedAt?.toISOString(),
      publications[0]?.id,
      publications[0]?.createdAt?.toISOString(),
      latestMetric?.id,
      latestMetric?.observedAt?.toISOString(),
      feedback?.generatedAt,
      feedback?.sampleSize,
    ]);

    return {
      core: {
        businessGoal:
          goalNorm.goalDescription ||
          goalNorm.goalLabel ||
          stringOrUndef(briefPayload.businessGoal),
        goalCode: goalNorm.goalCode,
        productSummary: stringOrUndef(briefPayload.productName),
        industry: stringOrUndef(briefPayload.industry) || project.industry || undefined,
        targetAudience: stringOrUndef(briefPayload.targetAudience),
        positioningSummary:
          stringOrUndef(positioning.accountRole) ||
          stringOrUndef(positioning.oneSentencePositioning) ||
          stringOrUndef(positioning.summary),
        currentStrategySummary:
          stringOrUndef(strategyPayload.primaryObjective) ||
          stringOrUndef(strategyPayload.summary) ||
          stringOrUndef(strategyPayload.strategySummary),
        contentDirection: contentDirections,
      },
      contentHistory: {
        recentTopics: uniqueBounded(topics, MEMORY_RECENT_LIMITS.topics),
        recentTitles: uniqueBounded(titles, MEMORY_RECENT_LIMITS.topics),
        recentHooks: uniqueBounded(hooks, MEMORY_RECENT_LIMITS.hooks),
        recentAngles: uniqueBounded(angles, MEMORY_RECENT_LIMITS.angles),
        recentCtas: uniqueBounded(ctas, MEMORY_RECENT_LIMITS.ctas),
        recentContentPillars: uniqueBounded(pillars, MEMORY_RECENT_LIMITS.pillars),
        recentBatchSummaries: recentBatchSummaries.slice(0, MEMORY_RECENT_LIMITS.batchSummaries),
        publishedTopicIds: [...new Set(publishedTopicIds)].slice(0, 40),
        confirmedScriptIds: confirmedScriptIds.slice(0, MEMORY_RECENT_LIMITS.scripts),
      },
      performance: {
        dataState: feedback?.dataState ?? 'NONE',
        sampleSize: feedback?.sampleSize ?? 0,
        recentPerformanceSignals: recentPerformanceSignals.slice(0, MEMORY_RECENT_LIMITS.performanceSignals),
        winningSignals,
        weakSignals,
        supportCountFloor: REPEATED_SIGNAL_MIN_SUPPORT,
        lastObservedAt: latestMetric?.observedAt?.toISOString() || feedback?.generatedAt,
      },
      production: {
        recentProductionModes: [],
        recentAssetTypes: [],
        recentVideoDurations: videos
          .map((v) => v.duration)
          .filter((d): d is number => typeof d === 'number' && d > 0)
          .slice(0, 10),
        reusedAssetIds: [],
      },
      patterns: {
        winningPatterns,
        losingPatterns,
        candidateSignals,
      },
      recent: {
        currentBatchId: latestPlan?.id,
        currentTopicId: unfinishedTopicIds[0],
        currentStrategyId: strategy?.id,
        lastConfirmedScriptId: scripts[0]?.id,
        currentProductionDirection: contentDirections?.[0],
        unfinishedTopicIds,
      },
      meta: {
        memoryVersion: ACCOUNT_MEMORY_PAYLOAD_VERSION,
        builtAt,
        sourceCounts: {
          productBriefs: brief ? 1 : 0,
          strategies: strategy ? 1 : 0,
          contentPlans: plans.length,
          scripts: scripts.length,
          publications: publications.length,
          videos: videos.length,
          metricSnapshots: latestMetric ? 1 : 0,
        },
        lastPublicationAt: publications[0]?.createdAt?.toISOString(),
        lastMetricAt: latestMetric?.observedAt?.toISOString(),
        lastContentPlanAt: plans[0]?.updatedAt?.toISOString(),
        confidenceSummary:
          feedback?.dataState === 'USABLE'
            ? 'performance_usable'
            : feedback?.dataState === 'LIMITED'
              ? 'performance_limited'
              : 'performance_none',
        watermark,
      },
    };
  }

  private logRefresh(input: {
    projectId: string;
    trigger: MemoryRefreshTrigger;
    oldVersion: number | null;
    newVersion: number;
    changed: boolean;
    durationMs: number;
  }) {
    this.logger.log(
      JSON.stringify({
        event: 'account_memory_refresh',
        projectId: input.projectId,
        trigger: input.trigger,
        oldVersion: input.oldVersion,
        newVersion: input.newVersion,
        sourceWatermarkChanged: input.changed,
        durationMs: input.durationMs,
      }),
    );
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true, industry: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

function toPublic(row: {
  id: string;
  projectId: string;
  version: number;
  status: AccountMemoryStatus;
  sourceWatermark: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AccountMemoryPublic {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    sourceWatermark: row.sourceWatermark,
    payload: row.payload as AccountMemoryPayload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrUndef(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

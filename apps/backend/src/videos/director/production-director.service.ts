import { Injectable, Logger } from '@nestjs/common';
import { AssetStatus, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth/auth.types.js';
import { resolveWorkspaceId } from '../../authz/workspace-context.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { asScriptOutput } from '../pipeline/production-plan.builder.js';
import { AccountMemoryService } from '../../memory/account-memory.service.js';
import { ReferenceIntelligenceService } from '../../market/reference-intelligence.service.js';
import {
  buildFallbackDirectorPlan,
  computeDirectorContextHash,
  toAssetCandidateView,
  toDirectorPublicView,
  validateDirectorOutput,
} from './production-director.helpers.js';
import { DIRECTOR_LIMITS, type ProductionDirectorOutput, type ProductionDirectorPublicView, type ProductionPreferences } from './production-director.types.js';
import { CAPABILITY_REGISTRY_VERSION } from './production-capability.registry.js';
import { isDigitalHumanProfileProductionEligible } from '../../digital-human/digital-human-eligibility.js';

@Injectable()
export class ProductionDirectorService {
  private readonly logger = new Logger(ProductionDirectorService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly memory: AccountMemoryService,
    private readonly references: ReferenceIntelligenceService,
  ) {}

  /**
   * Build (or return cached-equivalent) director plan for a confirmed script.
   * Deterministic by default — no LLM / no media providers.
   */
  async buildPlan(
    auth: AuthContext,
    input: {
      scriptId: string;
      videoId: string;
      preferences?: ProductionPreferences;
      preferredAssetIds?: string[];
      excludedAssetIds?: string[];
      referenceIds?: string[];
      aspectRatio?: string;
      targetDuration?: number;
      regenerate?: boolean;
      previousContextHash?: string;
    },
    workspaceHint?: string,
  ): Promise<{
    directorPlan: ProductionDirectorOutput;
    publicView: ProductionDirectorPublicView;
    created: boolean;
  }> {
    const started = Date.now();
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const script = await this.prisma.script.findFirst({
      where: {
        id: input.scriptId,
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
        status: 'CONFIRMED',
      },
    });
    if (!script) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }

    const payload = asScriptOutput(script.payload);
    const candidates = await this.loadAssetCandidates(
      auth,
      script.projectId,
      workspaceId,
      input.preferredAssetIds,
      input.excludedAssetIds,
    );

    let referencePatternIds: string[] = [];
    try {
      if (input.referenceIds?.length) {
        const ctx = await this.references.buildReferenceContext(auth, script.projectId, {
          workspaceHint,
          referenceIds: input.referenceIds.slice(0, 3),
        });
        referencePatternIds = ctx.patterns.map((p) => p.id).slice(0, DIRECTOR_LIMITS.maxReferencePatterns);
      } else {
        const ids = (payload as unknown as { referencePatternIds?: unknown }).referencePatternIds;
        if (Array.isArray(ids)) {
          referencePatternIds = ids
            .filter((id): id is string => typeof id === 'string')
            .slice(0, DIRECTOR_LIMITS.maxReferencePatterns);
        }
      }
    } catch {
      referencePatternIds = [];
    }

    let goalCode: string | undefined;
    let memoryVersion: number | undefined;
    try {
      const mem = await this.memory.getMemoryContext(auth, script.projectId, { workspaceHint });
      goalCode = mem.goalCode;
      // version not on context — optional
    } catch {
      goalCode = undefined;
    }
    try {
      const latest = await this.memory.getLatestActive(auth, script.projectId, workspaceHint);
      memoryVersion = latest?.version;
    } catch {
      memoryVersion = undefined;
    }

    const brief = await this.prisma.productBrief.findFirst({
      where: { tenantId: auth.tenantId, workspaceId, projectId: script.projectId },
      orderBy: { version: 'desc' },
      select: { payload: true },
    });
    const briefPayload =
      brief?.payload && typeof brief.payload === 'object' && !Array.isArray(brief.payload)
        ? (brief.payload as Record<string, unknown>)
        : {};
    if (!goalCode && typeof briefPayload.goalCode === 'string') goalCode = briefPayload.goalCode;

    const strategy = await this.prisma.campaignStrategy.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: script.projectId,
        status: { in: ['READY', 'CONFIRMED', 'ARCHIVED'] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });

    const dhRows = await this.prisma.digitalHumanProfile.findMany({
      where: { tenantId: auth.tenantId, workspaceId, deletedAt: null },
      take: 8,
      include: { sourceAsset: true },
      orderBy: { updatedAt: 'desc' },
    });
    const eligibleDigitalHumanProfileIds = dhRows
      .filter(
        (row) =>
          isDigitalHumanProfileProductionEligible({
            profile: row,
            tenantId: auth.tenantId,
            workspaceId,
            source: row.sourceAsset,
          }).eligible,
      )
      .map((row) => row.id)
      .slice(0, 5);

    const directorPlan = buildFallbackDirectorPlan({
      scriptId: script.id,
      scriptVersion: script.version,
      videoId: input.videoId,
      payload,
      aspectRatio: input.aspectRatio,
      targetDuration: input.targetDuration,
      preferences: input.preferences,
      candidates,
      preferredAssetIds: input.preferredAssetIds,
      referencePatternIds,
      goalCode,
      strategyId: strategy?.id,
      contentPlanId: script.contentPlanId ?? undefined,
      topicId: script.topicId ?? undefined,
      memorySnapshotVersion: memoryVersion,
      eligibleDigitalHumanProfileIds,
    });

    const allowed = new Set(candidates.map((c) => c.assetId));
    // Never allow selecting assets not in candidate set
    for (const shot of directorPlan.shots) {
      if (shot.selectedAssetId && !allowed.has(shot.selectedAssetId)) {
        shot.selectedAssetId = undefined;
      }
    }

    const validated = validateDirectorOutput(directorPlan, allowed);
    if (!validated.ok) {
      this.logger.warn(
        JSON.stringify({
          event: 'production_director_validation_failed',
          scriptId: script.id,
          errors: validated.errors,
        }),
      );
      // Force executable fallback: clear selected ids and force AI_IMAGE paths
      for (const shot of directorPlan.shots) {
        shot.selectedAssetId = undefined;
        shot.preferredSource = 'AI_IMAGE';
        shot.fallbackSources = ['SYSTEM_LIBRARY', 'USER_LIBRARY'];
      }
      directorPlan.productionWarnings.push({
        code: 'FALLBACK_DIRECTOR_USED',
        message: '制作方案已自动校正为可执行路径',
      });
      directorPlan.status = 'READY';
    }

    const sameHash =
      !input.regenerate &&
      input.previousContextHash &&
      input.previousContextHash === directorPlan.contextSnapshot.contextHash;

    this.logger.log(
      JSON.stringify({
        event: 'production_director_build',
        videoId: input.videoId,
        scriptId: script.id,
        mode: directorPlan.mode,
        shotCount: directorPlan.shots.length,
        assetCandidateCount: candidates.length,
        selectedAssetCount: directorPlan.shots.filter((s) => s.selectedAssetId).length,
        referencePatternCount: directorPlan.referencePatternIds.length,
        memoryVersion,
        contextHash: directorPlan.contextSnapshot.contextHash,
        capabilityVersion: CAPABILITY_REGISTRY_VERSION,
        fallbackUsed: directorPlan.productionWarnings.some((w) => w.code === 'FALLBACK_DIRECTOR_USED'),
        durationMs: Date.now() - started,
        created: !sameHash,
      }),
    );

    return {
      directorPlan,
      publicView: toDirectorPublicView(directorPlan),
      created: !sameHash,
    };
  }

  async getPlanForVideo(
    auth: AuthContext,
    videoId: string,
    workspaceHint?: string,
  ): Promise<ProductionDirectorPublicView | null> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(videoId)) throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!video) throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    if (!video.sourceJobId) return null;
    const job = await this.prisma.job.findFirst({
      where: { id: video.sourceJobId, tenantId: auth.tenantId },
      select: { input: true },
    });
    const input = job?.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const directorPlan = (input as { directorPlan?: ProductionDirectorOutput }).directorPlan;
    const generationVersion = (input as { generationVersion?: string }).generationVersion;
    if (!directorPlan) return null;
    return toDirectorPublicView(directorPlan, generationVersion);
  }

  /**
   * Lazy bootstrap for legacy videos without directorPlan — planning only, does not enqueue media.
   */
  async ensurePlanForVideo(
    auth: AuthContext,
    videoId: string,
    workspaceHint?: string,
  ): Promise<ProductionDirectorPublicView> {
    const existing = await this.getPlanForVideo(auth, videoId, workspaceHint);
    if (existing) return existing;
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!video?.scriptId) throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
    const built = await this.buildPlan(
      auth,
      { scriptId: video.scriptId, videoId: video.id },
      workspaceHint,
    );
    // Attach to current job input if present (additive), without changing generationVersion/execution.
    if (video.sourceJobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: video.sourceJobId, tenantId: auth.tenantId },
      });
      if (job) {
        const prev =
          job.input && typeof job.input === 'object' && !Array.isArray(job.input)
            ? (job.input as Record<string, unknown>)
            : {};
        if (!prev.directorPlan) {
          await this.prisma.job.update({
            where: { id_tenantId: { id: job.id, tenantId: auth.tenantId } },
            data: {
              input: {
                ...prev,
                directorPlan: built.directorPlan,
                directorContextHash: built.directorPlan.contextSnapshot.contextHash,
              },
            },
          });
        }
      }
    }
    return built.publicView;
  }

  private async loadAssetCandidates(
    auth: AuthContext,
    projectId: string,
    workspaceId: string,
    preferredAssetIds?: string[],
    excludedAssetIds?: string[],
  ) {
    const preferred = (preferredAssetIds ?? []).filter(isUuid).slice(0, 10);
    const excluded = new Set((excludedAssetIds ?? []).filter(isUuid));
    const rows = await this.prisma.asset.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId,
        deletedAt: null,
        status: AssetStatus.READY,
        libraryVisible: true,
        ...(excluded.size ? { id: { notIn: [...excluded] } } : {}),
        OR: preferred.length
          ? [{ id: { in: preferred } }, { referenceOnly: false }]
          : [{ referenceOnly: false }],
      },
      orderBy: [{ usedCount: 'asc' }, { updatedAt: 'desc' }],
      take: DIRECTOR_LIMITS.maxAssetCandidates,
    });
    const views = [];
    for (const row of rows) {
      if (excluded.has(row.id)) continue;
      const view = toAssetCandidateView(row, auth.tenantId);
      if (view) views.push(view);
    }
    // Prefer explicitly preferred ids first
    if (preferred.length) {
      views.sort((a, b) => {
        const ai = preferred.indexOf(a.assetId);
        const bi = preferred.indexOf(b.assetId);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    return views.slice(0, DIRECTOR_LIMITS.maxAssetCandidates);
  }
}

export { computeDirectorContextHash };

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, ResearchRequestStatus } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { buildMarketResearchContext } from '../market/market-source.js';
import { MarketResearchAdapterRegistry } from './research-adapter.registry.js';
import { DisabledMarketResearchAdapter } from './disabled-research.adapter.js';
import {
  AUTONOMOUS_RESEARCH_NOT_CONFIGURED,
  evidenceAgeDays,
  freshnessLabel,
  researchContentHash,
  researchQueryHash,
  toPublicResearchView,
  utcDayBucket,
  type AdapterResearchRequest,
  type MarketResearchSourceAdapter,
  type NormalizedResearchEvidence,
  type ResearchQueryContext,
} from './research.types.js';

@Injectable()
export class AutonomousResearchService {
  private readonly logger = new Logger(AutonomousResearchService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: MarketResearchAdapterRegistry,
    private readonly disabled: DisabledMarketResearchAdapter,
  ) {}

  async requestResearch(
    auth: AuthContext,
    projectId: string,
    input: {
      platform?: string;
      refresh?: boolean;
      seedKeywords?: string[];
      seedCompetitors?: string[];
      seedUrls?: string[];
      queryContext?: Partial<ResearchQueryContext>;
    },
    workspaceHint?: string,
    adapterOverride?: ReturnType<MarketResearchAdapterRegistry['resolve']>,
  ) {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const platform = (input.platform ?? project.platform ?? 'douyin').toLowerCase();
    const keywords = input.seedKeywords ?? input.queryContext?.keywords ?? [];
    const competitors = input.seedCompetitors ?? input.queryContext?.competitors ?? [];
    const urls = input.seedUrls ?? input.queryContext?.seedUrls ?? [];
    const adapter = adapterOverride ?? this.registry.resolve({
      id: 'pending',
      tenantId: auth.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      platform,
      queryContext: this.queryContext(input.queryContext, keywords, competitors, urls),
      seedKeywords: keywords,
      seedCompetitors: competitors,
      seedUrls: urls,
    });
    const queryHash = researchQueryHash({
      platform,
      keywords,
      competitors,
      urls,
      adapterVersion: adapter.getCapabilities().id,
      timeBucket: utcDayBucket(),
      refreshNonce: input.refresh ? `${Date.now()}` : undefined,
    });
    const existing = await this.prisma.researchRequest.findUnique({
      where: { tenantId_projectId_queryHash: { tenantId: auth.tenantId, projectId: project.id, queryHash } },
    });
    if (existing && !input.refresh) {
      return this.toPublic(existing.id, auth.tenantId);
    }

    const created = await this.prisma.researchRequest.create({
      data: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        platform,
        status: ResearchRequestStatus.PENDING,
        goal: input.queryContext?.businessGoal,
        queryContext: this.queryContext(input.queryContext, keywords, competitors, urls) as Prisma.InputJsonValue,
        seedKeywords: keywords as Prisma.InputJsonValue,
        seedCompetitors: competitors as Prisma.InputJsonValue,
        seedUrls: urls as Prisma.InputJsonValue,
        requestedByUserId: auth.userId,
        source: 'USER',
        queryHash,
        adapterId: adapter.getCapabilities().id,
      },
    });
    return this.execute(created.id, auth.tenantId, adapter);
  }

  async execute(requestId: string, tenantId: string, adapter: MarketResearchSourceAdapter = this.disabled) {
    const request = await this.prisma.researchRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request) {
      throw new AppError(ErrorCode.RESEARCH_REQUEST_NOT_FOUND);
    }
    const started = Date.now();
    await this.prisma.researchRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: { status: ResearchRequestStatus.RUNNING, startedAt: new Date(), adapterId: adapter.getCapabilities().id },
    });
    const adapterRequest: AdapterResearchRequest = {
      id: request.id,
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      platform: request.platform,
      queryContext: request.queryContext as ResearchQueryContext,
      seedKeywords: asStringArray(request.seedKeywords),
      seedCompetitors: asStringArray(request.seedCompetitors),
      seedUrls: asStringArray(request.seedUrls),
    };
    try {
      const fetched = await adapter.fetchEvidence(adapterRequest);
      if (!fetched.configured) {
        await this.prisma.researchRequest.update({
          where: { id_tenantId: { id: request.id, tenantId } },
          data: {
            status: ResearchRequestStatus.NOT_CONFIGURED,
            completedAt: new Date(),
            resultSummary: {
              code: fetched.code ?? AUTONOMOUS_RESEARCH_NOT_CONFIGURED,
              evidenceCount: 0,
            } as Prisma.InputJsonValue,
            usageSummary: { usageEventIds: [] } as Prisma.InputJsonValue,
          },
        });
        this.logResearch({
          requestId: request.id,
          projectId: request.projectId,
          platform: request.platform,
          adapter: adapter.getCapabilities().id,
          status: 'NOT_CONFIGURED',
          queryHash: request.queryHash,
          seedCount: adapterRequest.seedKeywords.length + adapterRequest.seedCompetitors.length,
          evidenceCount: 0,
          dedupeCount: 0,
          partialFailures: fetched.failures.length,
          durationMs: Date.now() - started,
          usageEventIds: [],
        });
        return this.toPublic(request.id, tenantId);
      }
      const persisted = await this.persistEvidence(request, fetched.evidence);
      const failed = fetched.failures.length > 0;
      const status =
        persisted.saved > 0 && failed
          ? ResearchRequestStatus.PARTIAL
          : persisted.saved === 0 && failed
            ? ResearchRequestStatus.FAILED
            : ResearchRequestStatus.COMPLETED;
      await this.prisma.researchRequest.update({
        where: { id_tenantId: { id: request.id, tenantId } },
        data: {
          status,
          completedAt: new Date(),
          failedAt: status === ResearchRequestStatus.FAILED ? new Date() : undefined,
          resultSummary: {
            evidenceCount: persisted.saved,
            dedupeCount: persisted.deduped,
            failures: fetched.failures,
          } as Prisma.InputJsonValue,
          usageSummary: { usageEventIds: [] } as Prisma.InputJsonValue,
        },
      });
      this.logResearch({
        requestId: request.id,
        projectId: request.projectId,
        platform: request.platform,
        adapter: adapter.getCapabilities().id,
        status,
        queryHash: request.queryHash,
        seedCount: adapterRequest.seedKeywords.length,
        evidenceCount: persisted.saved,
        dedupeCount: persisted.deduped,
        partialFailures: fetched.failures.length,
        durationMs: Date.now() - started,
        usageEventIds: [],
      });
      return this.toPublic(request.id, tenantId);
    } catch (error) {
      await this.prisma.researchRequest.update({
        where: { id_tenantId: { id: request.id, tenantId } },
        data: {
          status: ResearchRequestStatus.FAILED,
          failedAt: new Date(),
          resultSummary: { code: 'ADAPTER_ERROR' } as Prisma.InputJsonValue,
        },
      });
      this.logResearch({
        requestId: request.id,
        projectId: request.projectId,
        platform: request.platform,
        adapter: adapter.getCapabilities().id,
        status: 'FAILED',
        queryHash: request.queryHash,
        seedCount: 0,
        evidenceCount: 0,
        dedupeCount: 0,
        partialFailures: 1,
        durationMs: Date.now() - started,
        usageEventIds: [],
      });
      void error;
      return this.toPublic(request.id, tenantId);
    }
  }

  async getLatest(auth: AuthContext, projectId: string, workspaceHint?: string) {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const latest = await this.prisma.researchRequest.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return {
        capability: { douyinAutonomousResearch: 'notConfigured' as const },
        request: null,
      };
    }
    return {
      capability: { douyinAutonomousResearch: 'notConfigured' as const },
      request: await this.toPublic(latest.id, auth.tenantId),
    };
  }

  async getById(auth: AuthContext, projectId: string, id: string, workspaceHint?: string) {
    await this.requireProject(auth, projectId, workspaceHint);
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.RESEARCH_REQUEST_NOT_FOUND);
    }
    const row = await this.prisma.researchRequest.findFirst({
      where: { id, tenantId: auth.tenantId, projectId },
    });
    if (!row) {
      throw new AppError(ErrorCode.RESEARCH_REQUEST_NOT_FOUND);
    }
    return this.toPublic(row.id, auth.tenantId);
  }

  buildNormalizedContextForMi(input: {
    userSources?: Parameters<typeof buildMarketResearchContext>[0]['sources'];
    researchRequested?: boolean;
    systemEvidence: Array<{ id: string; title: string | null; sourceType: string; capturedAt: Date; provenance: string }>;
  }) {
    const base = buildMarketResearchContext({
      sources: input.userSources,
      researchRequested: input.researchRequested,
    });
    const latest = input.systemEvidence
      .map((item) => item.capturedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const age = latest ? evidenceAgeDays(latest) : null;
    return {
      ...base,
      systemEvidenceSummaries: input.systemEvidence.map((item) => ({
        id: item.id,
        label: item.title ?? item.sourceType,
        sourceType: item.sourceType,
        capturedAt: item.capturedAt.toISOString(),
        provenance: item.provenance,
      })),
      provenanceSummary: {
        ...base.provenanceSummary,
        systemDiscoveredCount: input.systemEvidence.filter((item) => item.provenance === 'SYSTEM_DISCOVERED').length,
      },
      researchCoverage: input.systemEvidence.length
        ? {
            keywordsCovered: 0,
            competitorsCovered: 0,
            videosCovered: input.systemEvidence.length,
            commentsCovered: 0,
          }
        : null,
      researchFreshness: {
        latestEvidenceAt: latest?.toISOString() ?? null,
        ageDays: age,
        freshnessLabel: freshnessLabel(age),
      },
    };
  }

  private async persistEvidence(
    request: { id: string; tenantId: string; workspaceId: string; projectId: string },
    rows: NormalizedResearchEvidence[],
  ) {
    let saved = 0;
    let deduped = 0;
    for (const row of rows) {
      if (row.sourceType === 'OWN_ACCOUNT_METRIC') {
        continue;
      }
      const hash = researchContentHash(row);
      try {
        await this.prisma.researchEvidence.create({
          data: {
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            researchRequestId: request.id,
            sourceType: row.sourceType,
            platform: row.platform,
            origin: row.origin,
            externalId: row.externalId,
            canonicalUrl: row.canonicalUrl,
            contentHash: hash,
            title: row.title,
            textSummary: row.textSummary,
            rawPayload: sanitizeRaw(row.rawPayload) as Prisma.InputJsonValue | undefined,
            normalizedPayload: row.normalizedPayload as Prisma.InputJsonValue,
            capturedAt: new Date(row.capturedAt),
            confidence: row.confidence,
            provenance: row.provenance,
            referenceOnly: row.referenceOnly,
            displayAllowed: row.displayAllowed,
            analysisAllowed: row.analysisAllowed,
            rightsStatus: row.rightsStatus,
            sourcePolicy: row.sourcePolicy,
          },
        });
        saved += 1;
      } catch (error) {
        if (isUniqueViolation(error)) {
          deduped += 1;
          continue;
        }
        throw error;
      }
    }
    return { saved, deduped };
  }

  private async toPublic(id: string, tenantId: string) {
    const row = await this.prisma.researchRequest.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { evidences: true } } },
    });
    if (!row) {
      throw new AppError(ErrorCode.RESEARCH_REQUEST_NOT_FOUND);
    }
    const limitation =
      row.status === ResearchRequestStatus.NOT_CONFIGURED
        ? '自动市场研究服务尚未配置，当前会继续使用你提供的信息。'
        : row.status === ResearchRequestStatus.FAILED
          ? '系统研究未完成，将继续使用你已提供的资料。'
          : '系统研究结果仅作内部分析参考。';
    return toPublicResearchView({
      id: row.id,
      status: row.status,
      platform: row.platform,
      requestedAt: row.requestedAt,
      completedAt: row.completedAt,
      evidenceCount: row._count.evidences,
      sourceCount: asStringArray(row.seedUrls).length + asStringArray(row.seedKeywords).length,
      coverage:
        row.status === ResearchRequestStatus.NOT_CONFIGURED || row._count.evidences === 0
          ? null
          : { keywordsCovered: 0, competitorsCovered: 0, videosCovered: row._count.evidences, commentsCovered: 0 },
      limitationSummary: limitation,
    });
  }

  private queryContext(
    partial: Partial<ResearchQueryContext> | undefined,
    keywords: string[],
    competitors: string[],
    urls: string[],
  ): ResearchQueryContext {
    return {
      businessGoal: partial?.businessGoal,
      productSummary: partial?.productSummary,
      industry: partial?.industry,
      audience: partial?.audience,
      positioning: partial?.positioning,
      strategySummary: partial?.strategySummary,
      keywords,
      competitors,
      seedUrls: urls,
      contentGaps: partial?.contentGaps,
    };
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

  private logResearch(payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify(payload));
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return true;
  }
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002');
}

function sanitizeRaw(raw?: Record<string, unknown>) {
  if (!raw) {
    return undefined;
  }
  const next = { ...raw };
  for (const key of Object.keys(next)) {
    if (/cookie|authorization|secret|apiKey|token/i.test(key)) {
      delete next[key];
    }
  }
  return next;
}

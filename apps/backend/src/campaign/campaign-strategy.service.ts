import { Injectable } from '@nestjs/common';
import { CampaignStrategyStatus, Prisma, PrismaClient } from '@prisma/client';
import { AgentsService } from '../agents/agent.service.js';
import {
  CAMPAIGN_STRATEGY_AGENT_ID,
  CAMPAIGN_STRATEGY_AGENT_VERSION,
  type AgentRunPublic,
} from '../agents/agent.types.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { campaignStrategySemanticFingerprint } from './campaign-strategy-fingerprint.js';
import { CampaignStrategyInputComposer } from './campaign-strategy-input.composer.js';
import { toPublicCampaignStrategy, type CampaignStrategyPublic } from './campaign-strategy.mapper.js';
import type { CampaignStrategyComposeRequest, CampaignStrategyInputSnapshot } from './campaign-strategy.types.js';
import { nextCampaignStrategyVersion } from './campaign-strategy-version.js';

export type CampaignStrategyGenerateResult = {
  strategy: CampaignStrategyPublic;
  run: AgentRunPublic;
};

@Injectable()
export class CampaignStrategyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly composer: CampaignStrategyInputComposer,
    private readonly agents: AgentsService,
  ) {}

  composeInput(
    auth: AuthContext,
    projectId: string,
    input: CampaignStrategyComposeRequest,
    workspaceHint?: string,
  ): Promise<CampaignStrategyInputSnapshot> {
    return this.composer.compose(auth, projectId, input, workspaceHint);
  }

  async generate(
    auth: AuthContext,
    projectId: string,
    input: CampaignStrategyComposeRequest,
    meta: { requestId: string; locale?: string; workspaceHint?: string; idempotencyKey: string },
  ): Promise<CampaignStrategyGenerateResult> {
    const project = await this.requireProject(auth, projectId, meta.workspaceHint);
    const snapshot = await this.composer.compose(auth, project.id, input, meta.workspaceHint);
    const fingerprint = campaignStrategySemanticFingerprint(snapshot);

    const replayed = await this.findByIdempotency(auth, project, meta.idempotencyKey);
    if (replayed?.strategy) {
      this.assertSameSemantic(replayed.strategy.inputSnapshot, fingerprint);
      return replayed;
    }

    const run = replayed?.run?.status === 'COMPLETED' && replayed.run.output
      ? replayed.run
      : await this.agents.execute(
          auth,
          {
            agentId: CAMPAIGN_STRATEGY_AGENT_ID,
            agentVersion: CAMPAIGN_STRATEGY_AGENT_VERSION,
            projectId: project.id,
            input: snapshot,
          },
          {
            requestId: meta.idempotencyKey,
            locale: meta.locale,
            workspaceHint: meta.workspaceHint,
          },
        );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`campaign-strategy:${auth.tenantId}:${project.id}:${meta.idempotencyKey}`})::bigint)`;
            const existingRun = await tx.agentRun.findFirst({
              where: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                agentId: CAMPAIGN_STRATEGY_AGENT_ID,
                requestId: meta.idempotencyKey,
                status: 'COMPLETED',
              },
              orderBy: { createdAt: 'asc' },
            });
            if (existingRun) {
              const existingStrategy = await tx.campaignStrategy.findFirst({
                where: {
                  tenantId: auth.tenantId,
                  projectId: project.id,
                  sourceAgentRunId: existingRun.id,
                },
              });
              if (existingStrategy) {
                this.assertSameSemantic(existingStrategy.inputSnapshot, fingerprint);
                return existingStrategy;
              }
            }
            const last = await tx.campaignStrategy.findFirst({
              where: { tenantId: auth.tenantId, projectId: project.id },
              orderBy: { version: 'desc' },
              select: { version: true },
            });
            return tx.campaignStrategy.create({
              data: {
                tenantId: auth.tenantId,
                workspaceId: project.workspaceId,
                projectId: project.id,
                version: nextCampaignStrategyVersion(last?.version),
                status: CampaignStrategyStatus.READY,
                productBriefId: snapshot.productBrief.id,
                marketResearchId: snapshot.marketInsight?.marketResearchId ?? null,
                marketInsightId: snapshot.marketInsight?.id ?? null,
                positioningRunId: snapshot.accountPositioning.positioningRunId,
                payload: run.output as Prisma.InputJsonValue,
                inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
                sourceAgentRunId: run.id,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        const persistedRun =
          created.sourceAgentRunId === run.id
            ? run
            : await this.agents.getRun(auth, created.sourceAgentRunId!, meta.workspaceHint);
        return { strategy: toPublicCampaignStrategy(created), run: persistedRun };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < 4
        ) {
          const raced = await this.findByIdempotency(auth, project, meta.idempotencyKey);
          if (raced?.strategy) {
            this.assertSameSemantic(raced.strategy.inputSnapshot, fingerprint);
            return raced;
          }
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate campaign strategy version');
  }

  async list(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<CampaignStrategyPublic[]> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const rows = await this.prisma.campaignStrategy.findMany({
      where: { tenantId: auth.tenantId, workspaceId: project.workspaceId, projectId: project.id },
      orderBy: { version: 'desc' },
    });
    return rows.map(toPublicCampaignStrategy);
  }

  async getLatest(auth: AuthContext, projectId: string, workspaceHint?: string): Promise<CampaignStrategyPublic> {
    const items = await this.list(auth, projectId, workspaceHint);
    if (items.length === 0) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
    }
    return items[0];
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<CampaignStrategyPublic> {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const row = await this.prisma.campaignStrategy.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId },
    });
    if (!row) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
    }
    return toPublicCampaignStrategy(row);
  }

  private async findByIdempotency(
    auth: AuthContext,
    project: { id: string; workspaceId: string },
    idempotencyKey: string,
  ): Promise<CampaignStrategyGenerateResult | { strategy: null; run: AgentRunPublic } | null> {
    const runRow = await this.prisma.agentRun.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        agentId: CAMPAIGN_STRATEGY_AGENT_ID,
        requestId: idempotencyKey,
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!runRow) {
      return null;
    }
    const run = await this.agents.getRun(auth, runRow.id);
    const strategy = await this.prisma.campaignStrategy.findFirst({
      where: { tenantId: auth.tenantId, projectId: project.id, sourceAgentRunId: runRow.id },
    });
    if (!strategy) {
      return { strategy: null, run };
    }
    return { strategy: toPublicCampaignStrategy(strategy), run };
  }

  private assertSameSemantic(inputSnapshot: unknown, fingerprint: string): void {
    const existing = inputSnapshot as CampaignStrategyInputSnapshot;
    if (!existing?.productBrief || campaignStrategySemanticFingerprint(existing) !== fingerprint) {
      throw new AppError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
    }
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

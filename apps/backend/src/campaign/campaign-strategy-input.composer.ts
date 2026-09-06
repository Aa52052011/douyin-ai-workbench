import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ACCOUNT_POSITIONING_AGENT_ID } from '../agents/agent.types.js';
import { requirePositioning } from '../agents/definitions/content-planning.agent.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { MarketInsightsService } from '../market/market-insights.service.js';
import { ProductBriefsService } from '../market/product-briefs.service.js';
import { PerformanceFeedbackService } from '../metrics/performance-feedback.service.js';
import {
  CAMPAIGN_STRATEGY_INPUT_PRIORITY,
  CAMPAIGN_STRATEGY_INPUT_VERSION,
  CAMPAIGN_STRATEGY_LIMITS,
  computeCampaignStrategyConfidenceCeiling,
  computeCampaignStrategyDataState,
  type CampaignStrategyComposeRequest,
  type CampaignStrategyFlag,
  type CampaignStrategyInputSnapshot,
  type CampaignStrategyInsightRef,
  type CampaignStrategyUserGoal,
} from './campaign-strategy.types.js';
import { assertCampaignStrategyInputSnapshot } from './campaign-strategy.validation.js';

@Injectable()
export class CampaignStrategyInputComposer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly briefs: ProductBriefsService,
    private readonly insights: MarketInsightsService,
    private readonly performanceFeedback: PerformanceFeedbackService,
  ) {}

  async compose(
    auth: AuthContext,
    projectId: string,
    input: CampaignStrategyComposeRequest,
    workspaceHint?: string,
  ): Promise<CampaignStrategyInputSnapshot> {
    const project = await this.requireProject(auth, projectId, workspaceHint);
    const brief = await this.briefs.requireCurrentPayload(auth, project.id, input.productBriefId, workspaceHint);
    const positioning = await this.loadPositioning(auth, project, input.positioningRunId);
    const insightRef = await this.loadInsight(auth, project, input, workspaceHint);
    const performanceFeedback = await this.performanceFeedback.buildForProject({
      tenantId: auth.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
    });

    const flags: CampaignStrategyFlag[] = [];
    const briefMismatch = Boolean(
      insightRef?.productBriefId && insightRef.productBriefId !== brief.id,
    );
    if (!insightRef) {
      flags.push('NO_MARKET_INSIGHT');
    } else if (briefMismatch) {
      flags.push('BRIEF_VERSION_MISMATCH');
    }
    if (performanceFeedback.dataState === 'NONE') {
      flags.push('NO_PERFORMANCE_HISTORY');
    }

    const dataState = computeCampaignStrategyDataState({
      marketInsight: insightRef?.payload ?? null,
      performance: performanceFeedback,
      briefMismatch,
    });
    const confidenceCeiling = computeCampaignStrategyConfidenceCeiling({
      marketInsight: insightRef?.payload ?? null,
      performance: performanceFeedback,
      briefMismatch,
    });

    const snapshot: CampaignStrategyInputSnapshot = {
      version: CAMPAIGN_STRATEGY_INPUT_VERSION,
      composedAt: new Date().toISOString(),
      productBrief: brief,
      marketInsight: insightRef,
      accountPositioning: positioning,
      performanceFeedback,
      currentUserGoal: parseUserGoal(input),
      projectContext: {
        name: project.name,
        ...(project.industry ? { industry: project.industry } : {}),
        ...(project.platform ? { platform: project.platform } : {}),
        ...(project.description ? { description: project.description } : {}),
      },
      dataState,
      confidenceCeiling,
      flags,
      inputPriority: CAMPAIGN_STRATEGY_INPUT_PRIORITY,
    };
    return assertCampaignStrategyInputSnapshot(snapshot);
  }

  private async loadPositioning(
    auth: AuthContext,
    project: { id: string; workspaceId: string },
    positioningRunId: string,
  ) {
    if (!positioningRunId?.trim()) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_POSITIONING_REQUIRED);
    }
    if (!isUuid(positioningRunId)) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_POSITIONING_INVALID);
    }
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: positioningRunId,
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
      },
      select: { id: true, agentId: true, status: true, output: true },
    });
    if (!run) {
      throw new AppError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    if (run.agentId !== ACCOUNT_POSITIONING_AGENT_ID || run.status !== 'COMPLETED' || !run.output) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_POSITIONING_INVALID);
    }
    try {
      return {
        positioningRunId: run.id,
        output: requirePositioning(run.output),
      };
    } catch {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_POSITIONING_INVALID);
    }
  }

  private async loadInsight(
    auth: AuthContext,
    project: { id: string; workspaceId: string },
    input: CampaignStrategyComposeRequest,
    workspaceHint?: string,
  ): Promise<CampaignStrategyInsightRef | null> {
    if (!input.marketInsightId && !input.marketResearchId) {
      return null;
    }
    const insight = input.marketInsightId
      ? await this.insights.getById(auth, input.marketInsightId, workspaceHint)
      : await this.insights.getLatest(auth, input.marketResearchId!, workspaceHint);
    if (insight.projectId !== project.id || insight.workspaceId !== project.workspaceId) {
      throw new AppError(ErrorCode.MARKET_INSIGHT_NOT_FOUND);
    }
    if (input.marketResearchId && insight.marketResearchId !== input.marketResearchId) {
      throw new AppError(ErrorCode.MARKET_INSIGHT_NOT_FOUND);
    }
    const research = await this.prisma.marketResearch.findFirst({
      where: {
        id: insight.marketResearchId,
        tenantId: auth.tenantId,
        workspaceId: project.workspaceId,
        projectId: project.id,
      },
      select: { productBriefId: true },
    });
    let productBriefVersion: number | null = null;
    if (research?.productBriefId) {
      const linked = await this.prisma.productBrief.findFirst({
        where: { id: research.productBriefId, tenantId: auth.tenantId, projectId: project.id },
        select: { version: true },
      });
      productBriefVersion = linked?.version ?? null;
    }
    return {
      id: insight.id,
      version: insight.version,
      marketResearchId: insight.marketResearchId,
      productBriefId: research?.productBriefId ?? null,
      productBriefVersion,
      payload: insight.payload,
    };
  }

  private async requireProject(auth: AuthContext, projectId: string, workspaceHint?: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: auth.tenantId, workspaceId, deletedAt: null },
      select: { id: true, workspaceId: true, name: true, industry: true, platform: true, description: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

function parseUserGoal(input: CampaignStrategyComposeRequest): CampaignStrategyUserGoal | null {
  const userGoal = trimLimited(input.userGoal, CAMPAIGN_STRATEGY_LIMITS.userGoal);
  const focus = trimLimited(input.focus, CAMPAIGN_STRATEGY_LIMITS.focus);
  const constraints = trimLimited(input.constraints, CAMPAIGN_STRATEGY_LIMITS.constraints);
  if (!userGoal && !focus && !constraints) {
    return null;
  }
  return {
    ...(userGoal ? { userGoal } : {}),
    ...(focus ? { focus } : {}),
    ...(constraints ? { constraints } : {}),
  };
}

function trimLimited(value: string | undefined, max: number): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `Field exceeds ${max} characters`);
  }
  return trimmed;
}

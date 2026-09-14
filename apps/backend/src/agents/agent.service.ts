import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { buildAgentContext } from './agent.context.js';
import { AgentEngine } from './agent.engine.js';
import { AgentError } from './agent.errors.js';
import { AgentRegistry } from './agent.registry.js';
import { toPublicAgentRun } from './agent.run-mapper.js';
import type { AgentDefinition, AgentRunPublic } from './agent.types.js';
import { parseAccountPositioningInput } from './definitions/account-positioning.agent.js';
import {
  parseContentPlanningInput,
  requirePositioning,
} from './definitions/content-planning.agent.js';
import { parseEchoInput } from './definitions/system-echo.agent.js';
import { parseScriptGenerationInput } from './definitions/script-generation.agent.js';
import { parseMarketIntelligenceInput } from './definitions/market-intelligence.agent.js';
import { parseCampaignStrategyInput } from './definitions/campaign-strategy.agent.js';
import { parseProductIntakeInput } from './definitions/product-intake.agent.js';
import { parseMarketIntakeInput } from './definitions/market-intake.agent.js';
import { parseReferenceAnalysisInput } from './definitions/reference-analysis.agent.js';
import { loadLatestEligiblePreviousBatch } from './learning/previous-batch-loader.js';
import {
  ACCOUNT_POSITIONING_AGENT_ID,
  CAMPAIGN_STRATEGY_AGENT_ID,
  CONTENT_PLANNING_AGENT_ID,
  ECHO_AGENT_ID,
  MARKET_INTELLIGENCE_AGENT_ID,
  PRODUCT_INTAKE_AGENT_ID,
  MARKET_INTAKE_AGENT_ID,
  REFERENCE_ANALYSIS_AGENT_ID,
  SCRIPT_GENERATION_AGENT_ID,
} from './agent.types.js';
import { PerformanceFeedbackService } from '../metrics/performance-feedback.service.js';
import { compactLearningContext, buildLearningSignalsFromPerformanceFeedback } from '../research/learning-signals.js';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: AgentEngine,
    private readonly registry: AgentRegistry,
    private readonly performanceFeedback: PerformanceFeedbackService,
  ) {}

  listAgents(): AgentDefinition[] {
    return this.engine.listDefinitions();
  }

  async getRun(auth: AuthContext, id: string, workspaceHint?: string): Promise<AgentRunPublic> {
    if (!isUuid(id)) {
      throw new AgentError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
      },
    });
    if (!run) {
      throw new AgentError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    return toPublicAgentRun(run);
  }

  async listRuns(
    auth: AuthContext,
    query: { projectId: string; agentId?: string },
    workspaceHint?: string,
  ): Promise<AgentRunPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const runs = await this.prisma.agentRun.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        agentId: query.agentId,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return runs.map(toPublicAgentRun);
  }

  async execute(
    auth: AuthContext,
    input: { agentId: string; agentVersion?: string; projectId: string; input: unknown },
    meta: { requestId: string; locale?: string; workspaceHint?: string },
  ): Promise<AgentRunPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const project = await this.requireProject(auth.tenantId, workspaceId, input.projectId);
    const definition = this.registry.get(input.agentId, input.agentVersion);
    const normalized = await this.normalizeInput(definition.id, input.input, {
      tenantId: auth.tenantId,
      workspaceId,
      projectId: project.id,
    });

    const context = buildAgentContext({
      auth: { ...auth, workspaceId },
      projectId: project.id,
      requestId: meta.requestId,
      locale: meta.locale,
    });

    return this.engine.execute({
      definition,
      context,
      input: normalized,
    });
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
        workspaceId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }

  private async normalizeInput(
    agentId: string,
    input: unknown,
    scope: { tenantId: string; workspaceId: string; projectId: string },
  ): Promise<unknown> {
    if (agentId === ECHO_AGENT_ID) {
      const parsed = parseEchoInput(input);
      if (!parsed) {
        throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
      }
      return parsed;
    }
    if (agentId === ACCOUNT_POSITIONING_AGENT_ID) {
      return parseAccountPositioningInput(input);
    }
    if (agentId === CONTENT_PLANNING_AGENT_ID) {
      return this.normalizeContentPlanningInput(input, scope);
    }
    if (agentId === SCRIPT_GENERATION_AGENT_ID) {
      return parseScriptGenerationInput(input);
    }
    if (agentId === MARKET_INTELLIGENCE_AGENT_ID) {
      return parseMarketIntelligenceInput(input);
    }
    if (agentId === CAMPAIGN_STRATEGY_AGENT_ID) {
      return parseCampaignStrategyInput(input);
    }
    if (agentId === PRODUCT_INTAKE_AGENT_ID) {
      return parseProductIntakeInput(input);
    }
    if (agentId === MARKET_INTAKE_AGENT_ID) {
      return parseMarketIntakeInput(input);
    }
    if (agentId === REFERENCE_ANALYSIS_AGENT_ID) {
      return parseReferenceAnalysisInput(input);
    }
    return input;
  }

  private async normalizeContentPlanningInput(
    input: unknown,
    scope: { tenantId: string; workspaceId: string; projectId: string },
  ) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    const record = input as Record<string, unknown>;
    if (record.campaignStrategy !== undefined) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    let positioning = record.positioning;
    if (typeof record.positioningRunId === 'string' && record.positioningRunId) {
      positioning = await this.loadPositioningFromRun(record.positioningRunId, scope);
    }
    const performanceFeedback = await this.performanceFeedback.buildForProject(scope);
    const campaignStrategy = await this.loadCampaignStrategy(record.strategyId, scope);
    const signals = buildLearningSignalsFromPerformanceFeedback(performanceFeedback);
    const latest = await this.prisma.strategyAdjustmentRecommendation.findFirst({
      where: { tenantId: scope.tenantId, projectId: scope.projectId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const recentPlan = await loadLatestEligiblePreviousBatch(this.prisma, scope);
    const learningContext = {
      ...compactLearningContext(signals),
      latestRecommendations: publicRecommendationRows(latest?.payload),
      ...(recentPlan
        ? {
            previousBatchSummary: {
              planId: recentPlan.planId,
              title: recentPlan.title,
              sampleSize: performanceFeedback.sampleSize,
              publicationsConsidered: performanceFeedback.publicationsConsidered,
            },
          }
        : {}),
    };
    return parseContentPlanningInput({
      ...record,
      positioning,
      performanceFeedback,
      learningContext,
      ...(campaignStrategy ? { campaignStrategy } : {}),
    });
  }

  private async loadPositioningFromRun(
    runId: string,
    scope: { tenantId: string; workspaceId: string; projectId: string },
  ) {
    if (!isUuid(runId)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    if (!run) {
      throw new AgentError(ErrorCode.AGENT_RUN_NOT_FOUND);
    }
    if (run.agentId !== ACCOUNT_POSITIONING_AGENT_ID) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (run.status !== 'COMPLETED' || !run.output) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    return requirePositioning(run.output);
  }

  private async loadCampaignStrategy(
    strategyId: unknown,
    scope: { tenantId: string; workspaceId: string; projectId: string },
  ) {
    if (strategyId === undefined || strategyId === null || strategyId === '') {
      return undefined;
    }
    if (typeof strategyId !== 'string' || !isUuid(strategyId)) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
    }
    const row = await this.prisma.campaignStrategy.findFirst({
      where: {
        id: strategyId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
      select: { id: true, version: true, status: true, payload: true },
    });
    if (!row) {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_FOUND);
    }
    if (row.status === 'ARCHIVED') {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_USABLE);
    }
    if (row.status !== 'READY' && row.status !== 'CONFIRMED') {
      throw new AppError(ErrorCode.CAMPAIGN_STRATEGY_NOT_USABLE);
    }
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      payload: row.payload,
    };
  }
}

function publicRecommendationRows(payload: unknown): Array<{ actionLabel: string; rationale: string }> {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const recs = (payload as { recommendations?: Array<{ action?: string; rationale?: string }> }).recommendations;
  if (!Array.isArray(recs)) {
    return [];
  }
  return recs.map((item) => ({
    actionLabel: planningActionLabel(String(item.action ?? 'KEEP')),
    rationale: item.rationale ?? '',
  }));
}

function planningActionLabel(action: string): string {
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

import { Injectable } from '@nestjs/common';
import { ContentPlanStatus, Prisma, PrismaClient, ScriptStatus } from '@prisma/client';
import { AgentsService } from '../agents/agent.service.js';
import {
  SCRIPT_GENERATION_AGENT_ID,
  SCRIPT_GENERATION_AGENT_VERSION,
} from '../agents/agent.types.js';
import {
  concatNarration,
  parseTargetDuration,
} from '../agents/definitions/script-generation.agent.js';
import {
  buildCompactContentPlanContext,
  buildCompactPreviousScriptSummaries,
  buildCompactStrategyContext,
} from '../agents/definitions/script-generation.context.js';
import type { ScriptOutput } from '../agents/definitions/script-generation.types.js';
import type { AccountPositioningOutput } from '../agents/definitions/account-positioning.types.js';
import type { ContentPlanOutput, ContentTopic } from '../agents/definitions/content-planning.types.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { AccountMemoryService } from '../memory/account-memory.service.js';
import { ReferenceIntelligenceService } from '../market/reference-intelligence.service.js';
import { toPublicScript, type ScriptPublic } from './scripts.mapper.js';
import {
  INVALID_AUTOMATED_CONFIRMATION,
  isBlockedScriptApprovalSource,
  parseScriptApprovalSource,
  type ScriptApprovalSource,
} from './human-approval.js';
import { applyInvalidAutomatedConfirmationCorrection } from './invalid-automated-confirmation.correction.js';

const ALLOWED_PLAN_STATUS = new Set<ContentPlanStatus>([
  ContentPlanStatus.CONFIRMED,
  ContentPlanStatus.ARCHIVED,
]);

@Injectable()
export class ScriptsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: AgentsService,
    private readonly memory: AccountMemoryService,
    private readonly referenceIntelligence: ReferenceIntelligenceService,
  ) {}

  async list(
    auth: AuthContext,
    query: { projectId: string; contentPlanId?: string; topicId?: string; status?: ScriptStatus },
    workspaceHint?: string,
  ): Promise<ScriptPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, query.projectId);
    const scripts = await this.prisma.script.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: query.projectId,
        contentPlanId: query.contentPlanId,
        topicId: query.topicId,
        status: query.status,
        deletedAt: null,
      },
      orderBy: [{ contentPlanId: 'desc' }, { topicId: 'desc' }, { version: 'desc' }],
    });
    return scripts.map(toPublicScript);
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<ScriptPublic> {
    return toPublicScript(await this.requireScript(auth, id, workspaceHint));
  }

  async create(
    auth: AuthContext,
    input: {
      contentPlanId: string;
      topicId: string;
      targetDuration?: number;
      requirements?: string;
      /** Explicit reference content ids only — never auto-selected. */
      referenceIds?: string[];
    },
    meta: { requestId: string; locale?: string; workspaceHint?: string },
  ): Promise<ScriptPublic> {
    const workspaceId = resolveWorkspaceId(auth, meta.workspaceHint);
    const plan = await this.requirePlan(auth.tenantId, workspaceId, input.contentPlanId);
    await this.requireProject(auth.tenantId, workspaceId, plan.projectId);
    if (!ALLOWED_PLAN_STATUS.has(plan.status)) {
      throw new AppError(ErrorCode.CONTENT_PLAN_CONFLICT);
    }
    const topic = findTopic(plan.payload, input.topicId);
    if (!topic) {
      throw new AppError(ErrorCode.SCRIPT_TOPIC_NOT_FOUND);
    }
    const payload = asPlanPayload(plan.payload);
    const targetDuration = parseTargetDuration(input.targetDuration, topic.estimatedDuration);
    const positioning = plan.positioningSnapshot as AccountPositioningOutput;

    const siblingScripts = await this.prisma.script.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        contentPlanId: plan.id,
        deletedAt: null,
      },
      orderBy: [{ topicId: 'asc' }, { version: 'asc' }],
      select: {
        topicId: true,
        status: true,
        title: true,
        payload: true,
        topicSnapshot: true,
      },
    });

    const contentPlanContext = buildCompactContentPlanContext({
      planTitle: plan.title,
      payload,
      currentTopicId: topic.id,
    });
    const previousScriptSummaries = buildCompactPreviousScriptSummaries({
      topics: payload?.topics ?? [topic],
      currentTopicId: topic.id,
      scripts: siblingScripts,
    });
    // CampaignStrategy has no soft-delete column — do not filter deletedAt (12.12Q-A).
    const strategyRow = await this.prisma.campaignStrategy.findFirst({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId: plan.projectId,
        status: { in: ['READY', 'CONFIRMED', 'ARCHIVED'] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { payload: true },
    });
    const strategyContext = buildCompactStrategyContext(strategyRow?.payload);

    let accountMemoryContext: Record<string, unknown> | undefined;
    try {
      accountMemoryContext = (await this.memory.getMemoryContext(auth, plan.projectId, {
        workspaceHint: meta.workspaceHint,
        current: {
          topicTitle: topic.title,
          contentPillar: topic.contentPillar,
          contentAngle: topic.contentAngle,
          hook: topic.hook,
          topicId: topic.id,
        },
      })) as unknown as Record<string, unknown>;
    } catch {
      accountMemoryContext = undefined;
    }

    // Selection rule: only explicit referenceIds; never surprise-pull project history.
    let referenceContext: Record<string, unknown> | undefined;
    try {
      const explicitIds = Array.isArray(input.referenceIds)
        ? input.referenceIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (explicitIds.length > 0) {
        referenceContext = (await this.referenceIntelligence.buildReferenceContext(
          auth,
          plan.projectId,
          { workspaceHint: meta.workspaceHint, referenceIds: explicitIds },
        )) as unknown as Record<string, unknown>;
      }
    } catch {
      referenceContext = undefined;
    }

    const run = await this.agents.execute(
      auth,
      {
        agentId: SCRIPT_GENERATION_AGENT_ID,
        agentVersion: SCRIPT_GENERATION_AGENT_VERSION,
        projectId: plan.projectId,
        input: {
          contentPlanId: plan.id,
          topicId: topic.id,
          topic,
          positioning,
          platform: plan.platform ?? payload?.platform ?? 'douyin',
          contentStyle: payload?.contentStyle,
          planTitle: plan.title,
          targetDuration,
          requirements: input.requirements,
          contentPlanContext,
          previousScriptSummaries,
          ...(strategyContext ? { strategyContext } : {}),
          ...(accountMemoryContext ? { accountMemoryContext } : {}),
          ...(referenceContext ? { referenceContext } : {}),
        },
      },
      meta,
    );

    const output = run.output as ScriptOutput;
    const referencePatternIds =
      referenceContext && Array.isArray((referenceContext as { patterns?: unknown }).patterns)
        ? ((referenceContext as { patterns: Array<{ id?: string }> }).patterns
            .map((p) => p.id)
            .filter((id): id is string => typeof id === 'string')
            .slice(0, 10))
        : [];
    // Agent completion never confirms. V1 has no auto-approval mode.
    return this.createVersionedRow({
      tenantId: auth.tenantId,
      workspaceId,
      projectId: plan.projectId,
      contentPlanId: plan.id,
      topicId: topic.id,
      title: output.title,
      content: concatNarration(output),
      payload: {
        ...output,
        ...(referencePatternIds.length > 0 ? { referencePatternIds } : {}),
      },
      topicSnapshot: topic,
      sourceAgentRunId: run.id,
    });
  }

  async update(
    auth: AuthContext,
    id: string,
    input: { title?: string; content?: string; payload?: Record<string, unknown> },
    workspaceHint?: string,
  ): Promise<ScriptPublic> {
    const current = await this.requireScript(auth, id, workspaceHint);
    if (current.status !== ScriptStatus.DRAFT) {
      throw new AppError(ErrorCode.SCRIPT_CONFLICT);
    }
    const updated = await this.prisma.script.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: {
        title: input.title,
        content: input.content,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
    return toPublicScript(updated);
  }

  async confirm(
    auth: AuthContext,
    id: string,
    workspaceHint?: string,
    options?: { approvalSource?: ScriptApprovalSource | string },
  ): Promise<ScriptPublic> {
    const source = parseScriptApprovalSource(options?.approvalSource);
    if (isBlockedScriptApprovalSource(source)) {
      throw new AppError(ErrorCode.SCRIPT_CONFIRM_NOT_HUMAN);
    }
    const current = await this.requireScript(auth, id, workspaceHint);
    if (current.status !== ScriptStatus.DRAFT) {
      throw new AppError(ErrorCode.SCRIPT_CONFLICT);
    }
    const updated = await this.prisma.script.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { status: ScriptStatus.CONFIRMED },
    });
    void this.memory.refreshMemorySafe(auth, updated.projectId, 'SCRIPT_CONFIRMED', workspaceHint);
    return toPublicScript(updated);
  }

  /**
   * Administrative correction for INVALID_AUTOMATED_CONFIRMATION.
   * Not a user unconfirm API and not mounted on the HTTP controller.
   */
  async correctInvalidAutomatedConfirmation(
    auth: AuthContext,
    id: string,
    workspaceHint?: string,
  ): Promise<ScriptPublic> {
    const current = await this.requireScript(auth, id, workspaceHint);
    const { after } = await applyInvalidAutomatedConfirmationCorrection(this.prisma, {
      scriptId: current.id,
      tenantId: auth.tenantId,
      reason: INVALID_AUTOMATED_CONFIRMATION,
    });
    void this.memory.refreshMemorySafe(auth, after.projectId, 'READ_STALE', workspaceHint);
    return toPublicScript(after);
  }

  async archive(auth: AuthContext, id: string, workspaceHint?: string): Promise<ScriptPublic> {
    const current = await this.requireScript(auth, id, workspaceHint);
    if (current.status !== ScriptStatus.CONFIRMED) {
      throw new AppError(ErrorCode.SCRIPT_CONFLICT);
    }
    const updated = await this.prisma.script.update({
      where: { id_tenantId: { id: current.id, tenantId: auth.tenantId } },
      data: { status: ScriptStatus.ARCHIVED },
    });
    return toPublicScript(updated);
  }

  private async requireScript(auth: AuthContext, id: string, workspaceHint?: string) {
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const script = await this.prisma.script.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        workspaceId,
        deletedAt: null,
      },
    });
    if (!script) {
      throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
    }
    return script;
  }

  private async requirePlan(tenantId: string, workspaceId: string, contentPlanId: string) {
    if (!isUuid(contentPlanId)) {
      throw new AppError(ErrorCode.CONTENT_PLAN_NOT_FOUND);
    }
    const plan = await this.prisma.contentPlan.findFirst({
      where: {
        id: contentPlanId,
        tenantId,
        workspaceId,
        deletedAt: null,
      },
    });
    if (!plan) {
      throw new AppError(ErrorCode.CONTENT_PLAN_NOT_FOUND);
    }
    return plan;
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

  private async createVersionedRow(data: {
    tenantId: string;
    workspaceId: string;
    projectId: string;
    contentPlanId: string;
    topicId: string;
    title: string;
    content: string;
    payload: ScriptOutput;
    topicSnapshot: ContentTopic;
    sourceAgentRunId: string;
  }): Promise<ScriptPublic> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const version = await this.nextVersion(data.tenantId, data.contentPlanId, data.topicId);
      try {
        const created = await this.prisma.script.create({
          data: {
            tenantId: data.tenantId,
            workspaceId: data.workspaceId,
            projectId: data.projectId,
            contentPlanId: data.contentPlanId,
            topicId: data.topicId,
            title: data.title,
            content: data.content,
            version,
            status: ScriptStatus.DRAFT, // never auto-confirm on create / agent completion
            payload: data.payload as unknown as Prisma.InputJsonValue,
            topicSnapshot: data.topicSnapshot as unknown as Prisma.InputJsonValue,
            sourceAgentRunId: data.sourceAgentRunId,
          },
        });
        return toPublicScript(created);
      } catch (error) {
        if (isUniqueConflict(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(ErrorCode.SCRIPT_CONFLICT);
  }

  private async nextVersion(
    tenantId: string,
    contentPlanId: string,
    topicId: string,
  ): Promise<number> {
    const last = await this.prisma.script.findFirst({
      where: { tenantId, contentPlanId, topicId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }
}

function findTopic(payload: unknown, topicId: string): ContentTopic | undefined {
  const plan = asPlanPayload(payload);
  return plan?.topics.find((item) => item.id === topicId);
}

function asPlanPayload(value: unknown): ContentPlanOutput | undefined {
  if (!value || typeof value !== 'object' || !('topics' in value)) {
    return undefined;
  }
  const topics = (value as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) {
    return undefined;
  }
  return value as ContentPlanOutput;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

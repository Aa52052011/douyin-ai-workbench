import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  ReferenceAnalysisStatus,
} from '@prisma/client';
import { AgentsService } from '../agents/agent.service.js';
import {
  REFERENCE_ANALYSIS_AGENT_ID,
  REFERENCE_ANALYSIS_AGENT_VERSION,
  type AgentRunPublic,
} from '../agents/agent.types.js';
import type { AuthContext } from '../auth/auth.types.js';
import { resolveWorkspaceId } from '../authz/workspace-context.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { isAssetProductionEligible } from '../assets/asset-library.js';
import {
  assessAnalysisInput,
  buildDeterministicReferenceAnalysis,
  computeReferenceInputHash,
  IMITATION_RISK_LABELS,
  mapOutputToPatternRows,
  PATTERN_TYPE_LABELS,
} from './reference-intelligence.helpers.js';
import {
  REFERENCE_CONTEXT_LIMITS,
  type CompactReferencePattern,
  type ReferenceAnalysisAgentInput,
  type ReferenceAnalysisOutputV1,
  type ReferenceContextView,
} from './reference-intelligence.types.js';
import type { ReferencePatternType } from './reference-intelligence.types.js';

export type ReferenceAnalysisPublic = {
  id: string;
  referenceContentId: string;
  projectId: string;
  version: number;
  status: string;
  statusLabel: string;
  analysisType: string;
  inputHash: string;
  payload: ReferenceAnalysisOutputV1 | Record<string, unknown>;
  sourceAgentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReferencePatternPublic = {
  id: string;
  referenceContentId: string;
  referenceAnalysisId: string;
  patternType: string;
  typeLabel: string;
  key: string;
  summary: string;
  confidence: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type ReferenceAnalyzeResult = {
  analysis: ReferenceAnalysisPublic;
  patterns: ReferencePatternPublic[];
  created: boolean;
  run?: AgentRunPublic;
  assetProductionEligible: boolean | null;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '分析中',
  COMPLETED: '已完成',
  FAILED: '分析失败',
  INSUFFICIENT: '输入不足',
};

@Injectable()
export class ReferenceIntelligenceService {
  private readonly logger = new Logger(ReferenceIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: AgentsService,
  ) {}

  async getLatestAnalysis(
    auth: AuthContext,
    projectId: string,
    referenceId: string,
    workspaceHint?: string,
  ): Promise<ReferenceAnalysisPublic | null> {
    const ref = await this.requireReference(auth, projectId, referenceId, workspaceHint);
    const row = await this.prisma.referenceAnalysis.findFirst({
      where: {
        tenantId: auth.tenantId,
        projectId: ref.projectId,
        referenceContentId: ref.id,
      },
      orderBy: { version: 'desc' },
    });
    return row ? toAnalysisPublic(row) : null;
  }

  async listPatterns(
    auth: AuthContext,
    projectId: string,
    referenceId: string,
    workspaceHint?: string,
  ): Promise<ReferencePatternPublic[]> {
    const ref = await this.requireReference(auth, projectId, referenceId, workspaceHint);
    const latest = await this.prisma.referenceAnalysis.findFirst({
      where: {
        tenantId: auth.tenantId,
        referenceContentId: ref.id,
        status: ReferenceAnalysisStatus.COMPLETED,
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (!latest) return [];
    const rows = await this.prisma.referencePattern.findMany({
      where: {
        tenantId: auth.tenantId,
        projectId: ref.projectId,
        referenceAnalysisId: latest.id,
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toPatternPublic);
  }

  async analyze(
    auth: AuthContext,
    projectId: string,
    referenceId: string,
    options: {
      reanalyze?: boolean;
      useAgent?: boolean;
      workspaceHint?: string;
      requestId?: string;
      locale?: string;
    } = {},
  ): Promise<ReferenceAnalyzeResult> {
    const started = Date.now();
    const ref = await this.requireReference(auth, projectId, referenceId, options.workspaceHint);
    const asset = ref.assetId
      ? await this.prisma.asset.findFirst({
          where: {
            id: ref.assetId,
            tenantId: auth.tenantId,
            projectId: ref.projectId,
            deletedAt: null,
          },
        })
      : null;

    const availableText = [ref.title, ref.note, ref.reasonForReference]
      .filter((x): x is string => Boolean(x && x.trim()))
      .join('\n');
    const assetHasUsefulMeta = Boolean(
      asset &&
        (asset.duration != null ||
          asset.width != null ||
          asset.height != null ||
          (asset.originalFilename && asset.originalFilename.trim()) ||
          (asset.mimeType && asset.mimeType.trim())),
    );

    const sufficiency = assessAnalysisInput({
      url: ref.url,
      assetId: ref.assetId,
      title: ref.title,
      note: ref.note,
      reasonForReference: ref.reasonForReference,
      availableText,
      assetHasUsefulMeta,
    });

    const agentInput: ReferenceAnalysisAgentInput = {
      referenceContentId: ref.id,
      platform: ref.platform,
      sourceType: ref.sourceType,
      reasonForReference: ref.reasonForReference,
      userNote: ref.note,
      title: ref.title,
      availableText,
      assetMetadata: asset
        ? {
            type: asset.type,
            mimeType: asset.mimeType,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            size: asset.size,
            originalFilename: asset.originalFilename,
          }
        : undefined,
    };

    const inputHash = computeReferenceInputHash([
      ref.id,
      ref.updatedAt.toISOString(),
      ref.title,
      ref.note,
      ref.reasonForReference,
      ref.url,
      ref.assetId,
      asset?.contentHash ?? null,
      asset?.updatedAt?.toISOString() ?? null,
      agentInput.availableText ?? null,
      REFERENCE_ANALYSIS_AGENT_VERSION,
      options.useAgent ? 'agent' : 'deterministic',
    ]);

    if (!options.reanalyze) {
      const existing = await this.prisma.referenceAnalysis.findFirst({
        where: {
          tenantId: auth.tenantId,
          referenceContentId: ref.id,
          inputHash,
          status: {
            in: [
              ReferenceAnalysisStatus.COMPLETED,
              ReferenceAnalysisStatus.INSUFFICIENT,
            ],
          },
        },
        orderBy: { version: 'desc' },
      });
      if (existing) {
        const patterns =
          existing.status === ReferenceAnalysisStatus.COMPLETED
            ? await this.prisma.referencePattern.findMany({
                where: { tenantId: auth.tenantId, referenceAnalysisId: existing.id },
                orderBy: { createdAt: 'asc' },
              })
            : [];
        this.logObs({
          projectId: ref.projectId,
          referenceId: ref.id,
          analysisVersion: existing.version,
          inputHash,
          status: existing.status,
          created: false,
          durationMs: Date.now() - started,
          patternCount: patterns.length,
        });
        return {
          analysis: toAnalysisPublic(existing),
          patterns: patterns.map(toPatternPublic),
          created: false,
          assetProductionEligible: asset
            ? isAssetProductionEligible({
                asset,
                callerTenantId: auth.tenantId,
              }).eligible
            : null,
        };
      }
    }

    if (!sufficiency.sufficient) {
      const created = await this.persistAnalysis({
        auth,
        ref,
        inputHash,
        status: ReferenceAnalysisStatus.INSUFFICIENT,
        payload: {
          code: 'ANALYSIS_INPUT_INSUFFICIENT',
          message:
            '当前只有链接或缺少可用描述，尚未读取视频内容。请上传视频/截图，或补充文字说明后再分析。',
          originalityGuidance:
            '系统只学习内容结构和表达模式，不直接复制原视频素材或文案。',
        },
        patterns: [],
        sourceAgentRunId: null,
      });
      this.logObs({
        projectId: ref.projectId,
        referenceId: ref.id,
        analysisVersion: created.analysis.version,
        inputHash,
        status: created.analysis.status,
        created: true,
        durationMs: Date.now() - started,
        patternCount: 0,
      });
      return {
        ...created,
        assetProductionEligible: asset
          ? isAssetProductionEligible({ asset, callerTenantId: auth.tenantId }).eligible
          : null,
      };
    }

    let output: ReferenceAnalysisOutputV1;
    let run: AgentRunPublic | undefined;
    if (options.useAgent) {
      run = await this.agents.execute(
        auth,
        {
          agentId: REFERENCE_ANALYSIS_AGENT_ID,
          agentVersion: REFERENCE_ANALYSIS_AGENT_VERSION,
          projectId: ref.projectId,
          input: agentInput,
        },
        {
          requestId: options.requestId ?? `ref-analysis-${ref.id}`,
          locale: options.locale,
          workspaceHint: options.workspaceHint,
        },
      );
      output = run.output as unknown as ReferenceAnalysisOutputV1;
    } else {
      output = buildDeterministicReferenceAnalysis(agentInput);
    }

    const patternRows = mapOutputToPatternRows(output);
    const created = await this.persistAnalysis({
      auth,
      ref,
      inputHash,
      status: ReferenceAnalysisStatus.COMPLETED,
      payload: output,
      patterns: patternRows,
      sourceAgentRunId: run?.id ?? null,
    });

    this.logObs({
      projectId: ref.projectId,
      referenceId: ref.id,
      analysisVersion: created.analysis.version,
      inputHash,
      agentVersion: REFERENCE_ANALYSIS_AGENT_VERSION,
      status: created.analysis.status,
      created: true,
      durationMs: Date.now() - started,
      patternCount: created.patterns.length,
      repairUsed: false,
      providerPath: options.useAgent ? 'agent' : 'deterministic',
    });

    return {
      ...created,
      run,
      assetProductionEligible: asset
        ? isAssetProductionEligible({ asset, callerTenantId: auth.tenantId }).eligible
        : null,
    };
  }

  /**
   * Selection rule (safe / no surprise):
   * - If `referenceIds` provided: only those (project-scoped, max 3)
   * - Else: empty context (do NOT auto-pull historical references into Script)
   */
  async buildReferenceContext(
    auth: AuthContext,
    projectId: string,
    options?: { workspaceHint?: string; referenceIds?: string[] },
  ): Promise<ReferenceContextView> {
    const workspaceId = resolveWorkspaceId(auth, options?.workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, projectId);

    const requested = (options?.referenceIds ?? []).filter(isUuid).slice(0, REFERENCE_CONTEXT_LIMITS.maxReferences);
    if (requested.length === 0) {
      return {
        referenceIds: [],
        patterns: [],
        warnings: [],
        sourceCount: 0,
        contextSummary: '',
        originalityGuidance:
          '系统只学习内容结构和表达模式，不直接复制原视频素材或文案。',
      };
    }

    const refs = await this.prisma.referenceContent.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        projectId,
        id: { in: requested },
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: REFERENCE_CONTEXT_LIMITS.maxReferences,
    });

    const patterns: CompactReferencePattern[] = [];
    const warnings: string[] = [];
    const perType = new Map<string, number>();

    for (const ref of refs) {
      const analysis = await this.prisma.referenceAnalysis.findFirst({
        where: {
          tenantId: auth.tenantId,
          referenceContentId: ref.id,
          status: ReferenceAnalysisStatus.COMPLETED,
        },
        orderBy: { version: 'desc' },
      });
      if (!analysis) {
        warnings.push(`参考「${ref.title || ref.sourceType}」尚未完成结构分析`);
        continue;
      }
      const rows = await this.prisma.referencePattern.findMany({
        where: { tenantId: auth.tenantId, referenceAnalysisId: analysis.id },
        orderBy: { createdAt: 'asc' },
        take: 12,
      });
      const sourceLabel = ref.title?.trim() || '参考内容';
      for (const row of rows) {
        if (patterns.length >= REFERENCE_CONTEXT_LIMITS.maxPatternsTotal) break;
        const count = perType.get(row.patternType) ?? 0;
        if (count >= REFERENCE_CONTEXT_LIMITS.maxPatternsPerType) continue;
        perType.set(row.patternType, count + 1);
        patterns.push({
          id: row.id,
          patternType: row.patternType,
          typeLabel: PATTERN_TYPE_LABELS[row.patternType as ReferencePatternType] ?? '结构模式',
          summary: row.summary.slice(0, REFERENCE_CONTEXT_LIMITS.maxSummaryChars),
          confidence: row.confidence,
          sourceLabel,
          referenceContentId: ref.id,
        });
      }
      const payload = analysis.payload as Record<string, unknown>;
      if (Array.isArray(payload.imitationRisks) && payload.imitationRisks.length > 0) {
        warnings.push('请避免照搬原作表达与素材');
      }
    }

    return {
      referenceIds: refs.map((r) => r.id),
      patterns,
      warnings: [...new Set(warnings)].slice(0, 6),
      sourceCount: refs.length,
      contextSummary:
        patterns.length > 0
          ? `已参考 ${refs.length} 条内容的 ${patterns.length} 个结构模式（仅结构，不复制原文）`
          : '',
      originalityGuidance:
        '系统只学习内容结构和表达模式，不直接复制原视频素材或文案。请结合产品、目标与定位原创。',
    };
  }

  private async persistAnalysis(input: {
    auth: AuthContext;
    ref: {
      id: string;
      tenantId: string;
      workspaceId: string;
      projectId: string;
    };
    inputHash: string;
    status: ReferenceAnalysisStatus;
    payload: Record<string, unknown> | ReferenceAnalysisOutputV1;
    patterns: Array<{
      patternType: string;
      key: string;
      summary: string;
      confidence: string;
      payload: Record<string, unknown>;
    }>;
    sourceAgentRunId: string | null;
  }): Promise<{ analysis: ReferenceAnalysisPublic; patterns: ReferencePatternPublic[]; created: true }> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const last = await tx.referenceAnalysis.findFirst({
            where: {
              tenantId: input.auth.tenantId,
              referenceContentId: input.ref.id,
            },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const version = (last?.version ?? 0) + 1;
          const analysis = await tx.referenceAnalysis.create({
            data: {
              tenantId: input.auth.tenantId,
              workspaceId: input.ref.workspaceId,
              projectId: input.ref.projectId,
              referenceContentId: input.ref.id,
              version,
              status: input.status,
              analysisType: 'STRUCTURE_V1',
              inputHash: input.inputHash,
              payload: input.payload as Prisma.InputJsonValue,
              sourceAgentRunId: input.sourceAgentRunId,
            },
          });

          const createdPatterns = [];
          for (const p of input.patterns) {
            const row = await tx.referencePattern.create({
              data: {
                tenantId: input.auth.tenantId,
                workspaceId: input.ref.workspaceId,
                projectId: input.ref.projectId,
                referenceContentId: input.ref.id,
                referenceAnalysisId: analysis.id,
                patternType: p.patternType,
                key: p.key,
                summary: p.summary,
                confidence: p.confidence,
                payload: p.payload as Prisma.InputJsonValue,
              },
            });
            createdPatterns.push(row);
          }
          return { analysis, patterns: createdPatterns };
        });
        return {
          analysis: toAnalysisPublic(result.analysis),
          patterns: result.patterns.map(toPatternPublic),
          created: true,
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
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate reference analysis version');
  }

  private logObs(input: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event: 'reference_analysis', ...input }));
  }

  private async requireReference(
    auth: AuthContext,
    projectId: string,
    referenceId: string,
    workspaceHint?: string,
  ) {
    if (!isUuid(projectId) || !isUuid(referenceId)) {
      throw new AppError(ErrorCode.REFERENCE_CONTENT_NOT_FOUND);
    }
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    await this.requireProject(auth.tenantId, workspaceId, projectId);
    const row = await this.prisma.referenceContent.findFirst({
      where: {
        id: referenceId,
        tenantId: auth.tenantId,
        workspaceId,
        projectId,
        deletedAt: null,
      },
    });
    if (!row) {
      throw new AppError(ErrorCode.REFERENCE_CONTENT_NOT_FOUND);
    }
    return row;
  }

  private async requireProject(tenantId: string, workspaceId: string, projectId: string) {
    if (!isUuid(projectId)) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return project;
  }
}

function toAnalysisPublic(row: {
  id: string;
  referenceContentId: string;
  projectId: string;
  version: number;
  status: ReferenceAnalysisStatus;
  analysisType: string;
  inputHash: string;
  payload: unknown;
  sourceAgentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ReferenceAnalysisPublic {
  return {
    id: row.id,
    referenceContentId: row.referenceContentId,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    analysisType: row.analysisType,
    inputHash: row.inputHash,
    payload: row.payload as ReferenceAnalysisOutputV1,
    sourceAgentRunId: row.sourceAgentRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPatternPublic(row: {
  id: string;
  referenceContentId: string;
  referenceAnalysisId: string;
  patternType: string;
  key: string;
  summary: string;
  confidence: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}): ReferencePatternPublic {
  return {
    id: row.id,
    referenceContentId: row.referenceContentId,
    referenceAnalysisId: row.referenceAnalysisId,
    patternType: row.patternType,
    typeLabel: PATTERN_TYPE_LABELS[row.patternType as ReferencePatternType] ?? '结构模式',
    key: row.key,
    summary: row.summary,
    confidence: row.confidence,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export { IMITATION_RISK_LABELS };

import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { AgentsService } from '../agents/agent.service.js';
import { MARKET_INTAKE_AGENT_ID, MARKET_INTAKE_AGENT_VERSION } from '../agents/agent.types.js';
import {
  parseMarketIntakeInput,
  sanitizeMarketIntakeUserDraft,
} from '../agents/definitions/market-intake.agent.js';
import { applyDeterministicMarketReadiness, mergeMarketIntakeDraft } from '../agents/definitions/market-intake.patch.js';
import type {
  MarketIntakeAgentOutput,
  MarketIntakeDraft,
  MarketIntakeProductBriefContext,
} from '../agents/definitions/market-intake.types.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { ProductBriefsService } from '../market/product-briefs.service.js';
import type { MarketIntakeTurnDto } from './dto/market-intake-turn.dto.js';

export type MarketIntakeTurnResponse = {
  message: string;
  draftPatch: MarketIntakeDraft;
  suggestions: MarketIntakeAgentOutput['suggestions'];
  missingAreas: string[];
  readyForConfirmation: boolean;
  requestId: string;
};

@Injectable()
export class MarketIntakeTurnService {
  constructor(
    private readonly agents: AgentsService,
    private readonly briefs: ProductBriefsService,
  ) {}

  async turn(
    auth: AuthContext,
    projectId: string,
    dto: MarketIntakeTurnDto,
    options: { requestId: string; workspaceHint?: string; locale?: string },
  ): Promise<MarketIntakeTurnResponse> {
    const briefRow = await this.briefs.requireCurrentPayload(auth, projectId, undefined, options.workspaceHint);
    const confirmedProductBrief = toBriefContext(briefRow.payload);

    let currentDraft: MarketIntakeDraft;
    try {
      currentDraft = sanitizeMarketIntakeUserDraft(stripNonAiDraftFields(dto.draft ?? {}));
    } catch {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '市场信息草稿格式不正确，请检查关键词、竞品账号或参考链接后重试。',
      );
    }

    const recentConversation = dto.messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.content.trim() }));

    const agentInput = parseMarketIntakeInput({
      mode: 'market',
      confirmedProductBrief,
      currentDraft,
      recentConversation,
      latestUserMessage: dto.userMessage,
      locale: dto.locale ?? options.locale ?? 'zh-CN',
      noDataAllowed: true,
      ...(dto.improvingExisting ? { improvingExisting: true } : {}),
    });

    const run = await this.agents.execute(
      auth,
      {
        agentId: MARKET_INTAKE_AGENT_ID,
        agentVersion: MARKET_INTAKE_AGENT_VERSION,
        projectId,
        input: agentInput,
      },
      {
        requestId: options.requestId,
        workspaceHint: options.workspaceHint,
        locale: dto.locale ?? options.locale ?? 'zh-CN',
      },
    );

    if (run.status !== 'COMPLETED' || !run.output || typeof run.output !== 'object') {
      throw new AppError(ErrorCode.AGENT_INVALID_OUTPUT, 'Market intake turn failed');
    }

    const output = run.output as unknown as MarketIntakeAgentOutput;
    const acknowledged = dto.userAcknowledgedLimitedData === true;
    const deterministic = applyDeterministicMarketReadiness({
      message: output.message,
      draftPatch: output.draftPatch ?? {},
      suggestions: output.suggestions ?? [],
      draftAfterMerge: mergeMarketIntakeDraft(currentDraft, output.draftPatch ?? {}),
      userAcknowledgedLimitedData: acknowledged,
    });

    return {
      message: deterministic.message,
      draftPatch: deterministic.draftPatch,
      suggestions: deterministic.suggestions,
      missingAreas: deterministic.missingAreas,
      readyForConfirmation: deterministic.readyForConfirmation,
      requestId: run.requestId,
    };
  }
}

function stripNonAiDraftFields(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw };
  delete next.userAcknowledgedLimitedData;
  delete next.uploadedSources;
  delete next.thirdPartyData;
  return next;
}

function toBriefContext(payload: Record<string, unknown> | object): MarketIntakeProductBriefContext {
  const p = payload as Record<string, unknown>;
  const ctx: MarketIntakeProductBriefContext = {
    productName: String(p.productName ?? ''),
    industry: String(p.industry ?? ''),
    businessGoal: String(p.businessGoal ?? ''),
  };
  if (typeof p.targetAudience === 'string' && p.targetAudience.trim()) {
    ctx.targetAudience = p.targetAudience.trim();
  }
  if (typeof p.description === 'string' && p.description.trim()) {
    ctx.description = p.description.trim();
  }
  if (Array.isArray(p.sellingPoints)) {
    ctx.sellingPoints = p.sellingPoints.filter((item): item is string => typeof item === 'string');
  }
  if (Array.isArray(p.seedKeywords)) {
    ctx.seedKeywords = p.seedKeywords.filter((item): item is string => typeof item === 'string');
  }
  return ctx;
}

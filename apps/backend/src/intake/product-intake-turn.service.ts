import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { AgentsService } from '../agents/agent.service.js';
import {
  PRODUCT_INTAKE_AGENT_ID,
  PRODUCT_INTAKE_AGENT_VERSION,
} from '../agents/agent.types.js';
import {
  parseProductIntakeInput,
  sanitizeProductIntakeDraftPatch,
} from '../agents/definitions/product-intake.agent.js';
import type {
  ProductIntakeAgentOutput,
  ProductIntakeDraft,
} from '../agents/definitions/product-intake.types.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { ProductIntakeTurnDto } from './dto/product-intake-turn.dto.js';

export type ProductIntakeTurnResponse = {
  message: string;
  draftPatch: ProductIntakeDraft;
  suggestions: ProductIntakeAgentOutput['suggestions'];
  missingFields: ProductIntakeAgentOutput['missingFields'];
  readyForConfirmation: boolean;
  requestId: string;
};

@Injectable()
export class ProductIntakeTurnService {
  constructor(private readonly agents: AgentsService) {}

  async turn(
    auth: AuthContext,
    projectId: string,
    dto: ProductIntakeTurnDto,
    options: { requestId: string; workspaceHint?: string; locale?: string },
  ): Promise<ProductIntakeTurnResponse> {
    let currentDraft: ProductIntakeDraft;
    try {
      currentDraft = sanitizeProductIntakeDraftPatch(dto.draft ?? {});
    } catch {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid product intake draft');
    }

    const recentConversation = dto.messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.content.trim() }));

    const agentInput = parseProductIntakeInput({
      mode: 'product',
      currentDraft,
      recentConversation,
      latestUserMessage: dto.userMessage,
      locale: dto.locale ?? options.locale ?? 'zh-CN',
      ...(dto.improvingExisting ? { improvingExisting: true } : {}),
    });

    const run = await this.agents.execute(
      auth,
      {
        agentId: PRODUCT_INTAKE_AGENT_ID,
        agentVersion: PRODUCT_INTAKE_AGENT_VERSION,
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
      throw new AppError(ErrorCode.AGENT_INVALID_OUTPUT, 'Product intake turn failed');
    }

    const output = run.output as unknown as ProductIntakeAgentOutput;

    return {
      message: output.message,
      draftPatch: output.draftPatch ?? {},
      suggestions: output.suggestions ?? [],
      missingFields: output.missingFields ?? [],
      readyForConfirmation: Boolean(output.readyForConfirmation),
      requestId: run.requestId,
    };
  }
}

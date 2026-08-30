import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { AgentRunLogger, payloadFingerprint } from '../agent.logger.js';
import { AgentRegistry } from '../agent.registry.js';
import {
  ECHO_AGENT_ID,
  ECHO_AGENT_VERSION,
  type InternalAgentRequest,
  type InternalAgentResponse,
  type JsonObject,
} from '../agent.types.js';
import { parseEchoInput } from '../definitions/system-echo.agent.js';
import { ModelRouter } from '../models/model.router.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { runWithTimeout } from '../timeout.js';
import type { AgentExecutor } from './agent.executor.js';

@Injectable()
export class InProcessAgentExecutor implements AgentExecutor {
  private readonly logger = new AgentRunLogger();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly models: ModelRouter,
    private readonly tools: ToolRegistry,
    private readonly prompts: PromptRegistry,
  ) {}

  async execute(request: InternalAgentRequest, timeoutMs: number): Promise<InternalAgentResponse> {
    return runWithTimeout(this.run(request), timeoutMs);
  }

  private async run(request: InternalAgentRequest): Promise<InternalAgentResponse> {
    const definition = this.registry.get(request.agentId, request.agentVersion);
    if (definition.id !== ECHO_AGENT_ID || definition.version !== ECHO_AGENT_VERSION) {
      throw new AgentError(ErrorCode.AGENT_NOT_FOUND);
    }

    const parsed = parseEchoInput(request.input);
    if (!parsed) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }

    const prompt = this.prompts.render(ECHO_AGENT_ID, ECHO_AGENT_VERSION, {
      message: parsed.message,
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: 'echo',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
    });
    const responseMeta = payloadFingerprint(model.text);
    this.logger.debugPrompt(request.requestId, prompt, model.text);

    await this.tools.invoke('echoTool', parsed, request.context);

    const output: JsonObject = {
      message: parsed.message,
      agent: ECHO_AGENT_ID,
      version: ECHO_AGENT_VERSION,
    };

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens,
      outputTokens: model.usage.outputTokens,
      totalTokens: model.usage.totalTokens,
    });

    return {
      status: 'COMPLETED',
      output,
      usage: model.usage,
    };
  }
}

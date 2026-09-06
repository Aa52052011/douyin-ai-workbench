import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { AgentRunLogger, payloadFingerprint } from '../agent.logger.js';
import { AgentRegistry } from '../agent.registry.js';
import {
  ACCOUNT_POSITIONING_AGENT_ID,
  ACCOUNT_POSITIONING_AGENT_VERSION,
  ACCOUNT_POSITIONING_PROMPT,
  CAMPAIGN_STRATEGY_AGENT_ID,
  CAMPAIGN_STRATEGY_AGENT_VERSION,
  CAMPAIGN_STRATEGY_PROMPT,
  CONTENT_PLANNING_AGENT_ID,
  CONTENT_PLANNING_AGENT_VERSION,
  CONTENT_PLANNING_PROMPT,
  MARKET_INTELLIGENCE_AGENT_ID,
  MARKET_INTELLIGENCE_AGENT_VERSION,
  MARKET_INTELLIGENCE_PROMPT,
  SCRIPT_GENERATION_AGENT_ID,
  SCRIPT_GENERATION_AGENT_VERSION,
  SCRIPT_GENERATION_PROMPT,
  ECHO_AGENT_ID,
  ECHO_AGENT_VERSION,
  type AgentDefinition,
  type InternalAgentRequest,
  type InternalAgentResponse,
  type JsonObject,
} from '../agent.types.js';
import {
  parseAccountPositioningInput,
  parseModelJson,
  validateAccountPositioningOutput,
} from '../definitions/account-positioning.agent.js';
import {
  finalizeContentPlanOutput,
  hasUsableTrendData,
  parseContentPlanningInput,
  validateContentPlanOutput,
} from '../definitions/content-planning.agent.js';
import { emptyPerformanceFeedback } from '../../metrics/performance-feedback.builder.js';
import {
  parseScriptGenerationInput,
  validateScriptOutput,
} from '../definitions/script-generation.agent.js';
import {
  buildInsufficientMarketInsight,
  parseMarketIntelligenceInput,
  validateMarketInsightOutput,
} from '../definitions/market-intelligence.agent.js';
import { parseCampaignStrategyInput } from '../definitions/campaign-strategy.agent.js';
import {
  collectMarketInsightCodes,
  collectPerformanceSignalCodes,
} from '../../campaign/campaign-strategy.types.js';
import { validateCampaignStrategyOutput } from '../../campaign/campaign-strategy.validation.js';
import { parseEchoInput } from '../definitions/system-echo.agent.js';
import { ModelRouter } from '../models/model.router.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { EmptyTrendDataProvider } from '../trends/empty-trend-data.provider.js';
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
    private readonly trends: EmptyTrendDataProvider = new EmptyTrendDataProvider(),
  ) {}

  async execute(request: InternalAgentRequest, timeoutMs: number): Promise<InternalAgentResponse> {
    return runWithTimeout(this.run(request), timeoutMs);
  }

  private async run(request: InternalAgentRequest): Promise<InternalAgentResponse> {
    const definition = this.registry.get(request.agentId, request.agentVersion);
    if (definition.id === ECHO_AGENT_ID && definition.version === ECHO_AGENT_VERSION) {
      return this.runEcho(request, definition);
    }
    if (
      definition.id === ACCOUNT_POSITIONING_AGENT_ID &&
      definition.version === ACCOUNT_POSITIONING_AGENT_VERSION
    ) {
      return this.runAccountPositioning(request, definition);
    }
    if (
      definition.id === CONTENT_PLANNING_AGENT_ID &&
      definition.version === CONTENT_PLANNING_AGENT_VERSION
    ) {
      return this.runContentPlanning(request, definition);
    }
    if (
      definition.id === SCRIPT_GENERATION_AGENT_ID &&
      definition.version === SCRIPT_GENERATION_AGENT_VERSION
    ) {
      return this.runScriptGeneration(request, definition);
    }
    if (
      definition.id === MARKET_INTELLIGENCE_AGENT_ID &&
      definition.version === MARKET_INTELLIGENCE_AGENT_VERSION
    ) {
      return this.runMarketIntelligence(request, definition);
    }
    if (
      definition.id === CAMPAIGN_STRATEGY_AGENT_ID &&
      definition.version === CAMPAIGN_STRATEGY_AGENT_VERSION
    ) {
      return this.runCampaignStrategy(request, definition);
    }
    throw new AgentError(ErrorCode.AGENT_NOT_FOUND);
  }

  private async runEcho(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
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
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });
    return { status: 'COMPLETED', output, usage: model.usage };
  }

  private async runAccountPositioning(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseAccountPositioningInput(request.input);
    const prompt = this.prompts.render(ACCOUNT_POSITIONING_PROMPT, ACCOUNT_POSITIONING_AGENT_VERSION, {
      industry: parsed.industry,
      platform: parsed.platform,
      accountType: parsed.accountType,
      goal: parsed.goal,
      targetAudience: parsed.targetAudience ?? '',
      expertise: parsed.expertise ?? '',
      additionalInfo: parsed.additionalInfo ?? '',
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: ACCOUNT_POSITIONING_AGENT_ID,
      model: definition.defaultModel,
      temperature: definition.temperature,
      maxTokens: definition.maxTokens,
      timeoutMs: definition.timeoutMs,
      responseFormat: 'json',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    const responseMeta = payloadFingerprint(model.text);
    const output = validateAccountPositioningOutput(parseModelJson(model.text));

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });

    return {
      status: 'COMPLETED',
      output: output as unknown as JsonObject,
      usage: model.usage,
    };
  }

  private async runContentPlanning(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseContentPlanningInput(request.input);
    const providedTrend = parsed.trendData ?? (await this.trends.getSnapshot({ platform: parsed.platform }));
    const usedTrendData = hasUsableTrendData(providedTrend ?? undefined);
    const feedback = parsed.performanceFeedback ?? emptyPerformanceFeedback();
    const prompt = this.prompts.render(CONTENT_PLANNING_PROMPT, CONTENT_PLANNING_AGENT_VERSION, {
      planningDays: String(parsed.planningDays),
      postsPerDay: String(parsed.postsPerDay),
      platform: parsed.platform,
      contentStyle: parsed.contentStyle ?? '',
      additionalRequirements: parsed.additionalRequirements ?? '',
      trendData: usedTrendData ? JSON.stringify(providedTrend) : '无',
      campaignStrategy: parsed.campaignStrategy ? JSON.stringify(parsed.campaignStrategy) : '无',
      performanceFeedback: JSON.stringify(feedback),
      positioning: JSON.stringify(parsed.positioning),
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: CONTENT_PLANNING_AGENT_ID,
      model: definition.defaultModel,
      temperature: definition.temperature,
      maxTokens: definition.maxTokens,
      timeoutMs: definition.timeoutMs,
      responseFormat: 'json',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    const responseMeta = payloadFingerprint(model.text);
    const parsedOutput = validateContentPlanOutput(parseModelJson(model.text), {
      planningDays: parsed.planningDays,
      postsPerDay: parsed.postsPerDay,
      pillarNames: parsed.positioning.contentPillars.map((item) => item.name),
    });
    const output = finalizeContentPlanOutput(parsedOutput, parsed, usedTrendData);

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });

    return {
      status: 'COMPLETED',
      output: output as unknown as JsonObject,
      usage: model.usage,
    };
  }

  private async runScriptGeneration(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseScriptGenerationInput(request.input);
    const prompt = this.prompts.render(SCRIPT_GENERATION_PROMPT, SCRIPT_GENERATION_AGENT_VERSION, {
      targetDuration: String(parsed.targetDuration),
      platform: parsed.platform,
      contentStyle: parsed.contentStyle ?? '',
      planTitle: parsed.planTitle ?? '',
      requirements: parsed.requirements ?? '',
      topic: JSON.stringify(parsed.topic),
      positioning: JSON.stringify(parsed.positioning),
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: SCRIPT_GENERATION_AGENT_ID,
      model: definition.defaultModel,
      temperature: definition.temperature,
      maxTokens: definition.maxTokens,
      timeoutMs: definition.timeoutMs,
      responseFormat: 'json',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    const responseMeta = payloadFingerprint(model.text);
    const output = validateScriptOutput(parseModelJson(model.text), parsed.targetDuration);

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });

    return {
      status: 'COMPLETED',
      output: output as unknown as JsonObject,
      usage: model.usage,
    };
  }

  private async runMarketIntelligence(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseMarketIntelligenceInput(request.input);
    if (parsed.marketEvidence.dataSufficiency === 'NONE') {
      const output = validateMarketInsightOutput(buildInsufficientMarketInsight(parsed), parsed);
      return {
        status: 'COMPLETED',
        output: output as unknown as JsonObject,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        },
      };
    }

    const prompt = this.prompts.render(MARKET_INTELLIGENCE_PROMPT, MARKET_INTELLIGENCE_AGENT_VERSION, {
      inputJson: JSON.stringify({
        productBrief: parsed.productBrief,
        marketEvidence: parsed.marketEvidence,
        ...(parsed.userFocus ? { userFocus: parsed.userFocus } : {}),
      }),
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: MARKET_INTELLIGENCE_AGENT_ID,
      model: definition.defaultModel,
      temperature: definition.temperature,
      maxTokens: definition.maxTokens,
      timeoutMs: definition.timeoutMs,
      responseFormat: 'json',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    const responseMeta = payloadFingerprint(model.text);
    const output = validateMarketInsightOutput(parseModelJson(model.text), parsed);

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });

    return {
      status: 'COMPLETED',
      output: output as unknown as JsonObject,
      usage: model.usage,
    };
  }

  private async runCampaignStrategy(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseCampaignStrategyInput(request.input);
    const marketInsightCodes = parsed.marketInsight
      ? collectMarketInsightCodes(parsed.marketInsight.payload)
      : [];
    const performanceSignalCodes = collectPerformanceSignalCodes(parsed.performanceFeedback);
    const prompt = this.prompts.render(CAMPAIGN_STRATEGY_PROMPT, CAMPAIGN_STRATEGY_AGENT_VERSION, {
      inputJson: JSON.stringify(parsed),
      marketInsightCodes: marketInsightCodes.length > 0 ? marketInsightCodes.join(', ') : 'NONE',
      performanceSignalCodes:
        performanceSignalCodes.length > 0 ? performanceSignalCodes.join(', ') : 'NONE',
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const model = await this.models.generate({
      agentId: definition.id,
      tenantId: request.context.tenantId,
      task: CAMPAIGN_STRATEGY_AGENT_ID,
      model: definition.defaultModel,
      temperature: definition.temperature,
      maxTokens: definition.maxTokens,
      timeoutMs: definition.timeoutMs,
      responseFormat: 'json',
      systemPrompt: prompt.systemPrompt,
      prompt: prompt.userPrompt,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    const responseMeta = payloadFingerprint(model.text);
    const output = validateCampaignStrategyOutput(parseModelJson(model.text), parsed);

    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: promptMeta.hash,
      promptLength: promptMeta.length,
      responseHash: responseMeta.hash,
      responseLength: responseMeta.length,
      inputTokens: model.usage.inputTokens ?? undefined,
      outputTokens: model.usage.outputTokens ?? undefined,
      totalTokens: model.usage.totalTokens ?? undefined,
    });

    return {
      status: 'COMPLETED',
      output: output as unknown as JsonObject,
      usage: model.usage,
    };
  }
}

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
  MARKET_INTAKE_AGENT_ID,
  MARKET_INTAKE_AGENT_VERSION,
  MARKET_INTAKE_PROMPT,
  PRODUCT_INTAKE_AGENT_ID,
  PRODUCT_INTAKE_AGENT_VERSION,
  PRODUCT_INTAKE_PROMPT,
  REFERENCE_ANALYSIS_AGENT_ID,
  REFERENCE_ANALYSIS_AGENT_VERSION,
  REFERENCE_ANALYSIS_PROMPT,
  SCRIPT_GENERATION_AGENT_ID,
  SCRIPT_GENERATION_AGENT_VERSION,
  SCRIPT_GENERATION_PROMPT,
  PERFORMANCE_ANALYSIS_AGENT_ID,
  PERFORMANCE_ANALYSIS_AGENT_VERSION,
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
  listMarketEvidenceItems,
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
import {
  parseAndValidateProductIntakeModelText,
  parseProductIntakeInput,
} from '../definitions/product-intake.agent.js';
import type { ProductIntakeAgentInput } from '../definitions/product-intake.types.js';
import {
  compactProductIntakeDraft,
  getProductIntakeQuestionPlan,
} from '../definitions/product-intake-question-plan.js';
import {
  parseAndValidateMarketIntakeModelText,
  parseMarketIntakeInput,
} from '../definitions/market-intake.agent.js';
import type { MarketIntakeAgentInput } from '../definitions/market-intake.types.js';
import {
  compactMarketIntakeDraft,
  getMarketIntakeQuestionPlan,
} from '../definitions/market-intake-question-plan.js';
import {
  parseAndValidateReferenceAnalysisModelText,
  parseReferenceAnalysisInput,
} from '../definitions/reference-analysis.agent.js';
import { runDeterministicPerformanceAnalysis, type PerformanceAnalysisInputV1 } from '../../performance-analysis/performance-analysis.engine.js';
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
    return runWithTimeout(() => this.run(request), timeoutMs);
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
    if (
      definition.id === PRODUCT_INTAKE_AGENT_ID &&
      definition.version === PRODUCT_INTAKE_AGENT_VERSION
    ) {
      return this.runProductIntake(request, definition);
    }
    if (
      definition.id === MARKET_INTAKE_AGENT_ID &&
      definition.version === MARKET_INTAKE_AGENT_VERSION
    ) {
      return this.runMarketIntake(request, definition);
    }
    if (
      definition.id === REFERENCE_ANALYSIS_AGENT_ID &&
      definition.version === REFERENCE_ANALYSIS_AGENT_VERSION
    ) {
      return this.runReferenceAnalysis(request, definition);
    }
    if (
      definition.id === PERFORMANCE_ANALYSIS_AGENT_ID &&
      definition.version === PERFORMANCE_ANALYSIS_AGENT_VERSION
    ) {
      return this.runPerformanceAnalysis(request, definition);
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
      contentPlanContext: JSON.stringify(parsed.contentPlanContext ?? {}),
      previousScriptSummaries: JSON.stringify(parsed.previousScriptSummaries ?? []),
      strategyContext: JSON.stringify(parsed.strategyContext ?? {}),
      accountMemoryContext: JSON.stringify(parsed.accountMemoryContext ?? {}),
      referenceContext: JSON.stringify(parsed.referenceContext ?? {}),
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

    const generateOnce = async (userPrompt: string) =>
      this.models.generate({
        agentId: definition.id,
        tenantId: request.context.tenantId,
        task: MARKET_INTELLIGENCE_AGENT_ID,
        model: definition.defaultModel,
        temperature: definition.temperature,
        maxTokens: definition.maxTokens,
        timeoutMs: definition.timeoutMs,
        responseFormat: 'json',
        systemPrompt: prompt.systemPrompt,
        prompt: userPrompt,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

    let model = await generateOnce(prompt.userPrompt);
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    let responseMeta = payloadFingerprint(model.text);
    let output: ReturnType<typeof validateMarketInsightOutput>;
    try {
      output = validateMarketInsightOutput(parseModelJson(model.text), parsed);
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== ErrorCode.AGENT_INVALID_OUTPUT) {
        throw error;
      }
      // One schema-repair retry only (same pattern as intake / strategy).
      const availableCodes = listMarketEvidenceItems(parsed.marketEvidence)
        .map((item) => item.code)
        .slice(0, 40);
      const repairPrompt = `${prompt.userPrompt}

上次输出未通过 schema 校验。请重新输出：仅一个 JSON 对象；不要 markdown。
硬修复要求：
- marketResearchId / evidenceVersion 必须与输入 MarketEvidence 完全一致
- evidenceCodes 只能从以下真实 code 中选择：${JSON.stringify(availableCodes)}
- 若 dataSufficiency=LIMITED：marketState 只能是 LIMITED_SIGNAL 或 INSUFFICIENT_DATA；confidence 只能 LOW/MEDIUM；dataLimitations 必须非空且建议包含 LIMITED_SAMPLE
- 禁止虚构 evidenceCode、禁止 HIGH（当 LIMITED）、禁止平台级断言`;
      const repaired = await generateOnce(repairPrompt);
      model = {
        ...repaired,
        usage: {
          inputTokens: (model.usage.inputTokens ?? 0) + (repaired.usage.inputTokens ?? 0),
          outputTokens: (model.usage.outputTokens ?? 0) + (repaired.usage.outputTokens ?? 0),
          totalTokens: (model.usage.totalTokens ?? 0) + (repaired.usage.totalTokens ?? 0),
          estimatedCost:
            model.usage.estimatedCost == null && repaired.usage.estimatedCost == null
              ? null
              : (model.usage.estimatedCost ?? 0) + (repaired.usage.estimatedCost ?? 0),
        },
      };
      responseMeta = payloadFingerprint(model.text);
      output = validateMarketInsightOutput(parseModelJson(model.text), parsed);
    }

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

    const generateOnce = async (userPrompt: string) =>
      this.models.generate({
        agentId: definition.id,
        tenantId: request.context.tenantId,
        task: CAMPAIGN_STRATEGY_AGENT_ID,
        model: definition.defaultModel,
        temperature: definition.temperature,
        maxTokens: definition.maxTokens,
        timeoutMs: definition.timeoutMs,
        responseFormat: 'json',
        systemPrompt: prompt.systemPrompt,
        prompt: userPrompt,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

    let model = await generateOnce(prompt.userPrompt);
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    let responseMeta = payloadFingerprint(model.text);
    let output: ReturnType<typeof validateCampaignStrategyOutput>;
    try {
      output = validateCampaignStrategyOutput(parseModelJson(model.text), parsed);
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== ErrorCode.AGENT_INVALID_OUTPUT) {
        throw error;
      }
      // One schema-repair retry only (aligned with intake / market intelligence).
      const repairPrompt = `${prompt.userPrompt}

上次输出未通过 schema 校验。请重新输出：仅一个 JSON 对象；不要 markdown。
硬修复要求：
- evidenceBasis.type / ref 只能使用提示中允许的类型与 code（marketInsightCodes=[${
        marketInsightCodes.length > 0 ? marketInsightCodes.join(', ') : 'NONE'
      }]；performanceSignalCodes=[${
        performanceSignalCodes.length > 0 ? performanceSignalCodes.join(', ') : 'NONE'
      }]）
- 禁止虚构 MARKET_INSIGHT / PERFORMANCE ref
- 无市场洞察时不得写“根据市场数据”；无表现反馈时不得写“历史表现表明”
- confidence / dataLimitations 必须与输入数据充分度一致；低数据场景优先 LOW 并写清限制`;
      const repaired = await generateOnce(repairPrompt);
      model = {
        ...repaired,
        usage: {
          inputTokens: (model.usage.inputTokens ?? 0) + (repaired.usage.inputTokens ?? 0),
          outputTokens: (model.usage.outputTokens ?? 0) + (repaired.usage.outputTokens ?? 0),
          totalTokens: (model.usage.totalTokens ?? 0) + (repaired.usage.totalTokens ?? 0),
          estimatedCost:
            model.usage.estimatedCost == null && repaired.usage.estimatedCost == null
              ? null
              : (model.usage.estimatedCost ?? 0) + (repaired.usage.estimatedCost ?? 0),
        },
      };
      responseMeta = payloadFingerprint(model.text);
      output = validateCampaignStrategyOutput(parseModelJson(model.text), parsed);
    }

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

  private async runProductIntake(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed: ProductIntakeAgentInput = parseProductIntakeInput(request.input);
    const conversationText = parsed.recentConversation
      .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
      .join('\n');
    const questionPlan = getProductIntakeQuestionPlan(parsed.currentDraft, {
      improvingExisting: parsed.improvingExisting,
    });
    const prompt = this.prompts.render(PRODUCT_INTAKE_PROMPT, PRODUCT_INTAKE_AGENT_VERSION, {
      mode: parsed.mode,
      locale: parsed.locale,
      improvingExisting: parsed.improvingExisting ? 'true' : 'false',
      currentDraftJson: JSON.stringify(compactProductIntakeDraft(parsed.currentDraft)),
      missingRequiredFields: JSON.stringify(questionPlan.missingRequiredFields),
      nextPriorityFields: JSON.stringify(questionPlan.nextPriorityFields),
      missingRequiredLabels: JSON.stringify(questionPlan.missingRequiredLabels),
      optionalLaterFields: JSON.stringify(questionPlan.optionalLaterFields),
      recentConversationText: conversationText || '（无）',
      latestUserMessage: parsed.latestUserMessage,
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const generateOnce = async (userPrompt: string) =>
      this.models.generate({
        agentId: definition.id,
        tenantId: request.context.tenantId,
        task: PRODUCT_INTAKE_AGENT_ID,
        model: definition.defaultModel,
        temperature: definition.temperature,
        maxTokens: definition.maxTokens,
        timeoutMs: definition.timeoutMs,
        responseFormat: 'json',
        systemPrompt: prompt.systemPrompt,
        prompt: userPrompt,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

    let model = await generateOnce(prompt.userPrompt);
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    let responseMeta = payloadFingerprint(model.text);
    let output;
    try {
      output = parseAndValidateProductIntakeModelText(model.text, parsed.currentDraft);
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== ErrorCode.AGENT_INVALID_OUTPUT) {
        throw error;
      }
      // One schema-repair retry only.
      const repairPrompt = `${prompt.userPrompt}

上次输出未通过 schema 校验。请重新输出：仅一个 JSON 对象；draftPatch 数组字段必须是 string[]；不要 markdown。`;
      const repaired = await generateOnce(repairPrompt);
      model = {
        ...repaired,
        usage: {
          inputTokens: (model.usage.inputTokens ?? 0) + (repaired.usage.inputTokens ?? 0),
          outputTokens: (model.usage.outputTokens ?? 0) + (repaired.usage.outputTokens ?? 0),
          totalTokens: (model.usage.totalTokens ?? 0) + (repaired.usage.totalTokens ?? 0),
          estimatedCost:
            model.usage.estimatedCost == null && repaired.usage.estimatedCost == null
              ? null
              : (model.usage.estimatedCost ?? 0) + (repaired.usage.estimatedCost ?? 0),
        },
      };
      responseMeta = payloadFingerprint(model.text);
      output = parseAndValidateProductIntakeModelText(model.text, parsed.currentDraft);
    }

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

  private async runMarketIntake(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed: MarketIntakeAgentInput = parseMarketIntakeInput(request.input);
    const conversationText = parsed.recentConversation
      .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
      .join('\n');
    const questionPlan = getMarketIntakeQuestionPlan(parsed.currentDraft, {
      userAcknowledgedLimitedData: false,
    });
    const prompt = this.prompts.render(MARKET_INTAKE_PROMPT, MARKET_INTAKE_AGENT_VERSION, {
      mode: parsed.mode,
      locale: parsed.locale,
      noDataAllowed: 'true',
      improvingExisting: parsed.improvingExisting ? 'true' : 'false',
      hasMarketMaterial: questionPlan.hasMarketMaterial ? 'true' : 'false',
      userAcknowledgedLimitedData: questionPlan.userAcknowledgedLimitedData ? 'true' : 'false',
      alreadyFilledFields: JSON.stringify(questionPlan.alreadyFilledFields),
      nextPriorityFields: JSON.stringify(questionPlan.nextPriorityFields),
      confirmedProductBriefJson: JSON.stringify(parsed.confirmedProductBrief),
      currentDraftJson: JSON.stringify(compactMarketIntakeDraft(parsed.currentDraft)),
      recentConversationText: conversationText || '（无）',
      latestUserMessage: parsed.latestUserMessage,
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const generateOnce = async (userPrompt: string) =>
      this.models.generate({
        agentId: definition.id,
        tenantId: request.context.tenantId,
        task: MARKET_INTAKE_AGENT_ID,
        model: definition.defaultModel,
        temperature: definition.temperature,
        maxTokens: definition.maxTokens,
        timeoutMs: definition.timeoutMs,
        responseFormat: 'json',
        systemPrompt: prompt.systemPrompt,
        prompt: userPrompt,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

    let model = await generateOnce(prompt.userPrompt);
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    let responseMeta = payloadFingerprint(model.text);
    let output;
    try {
      output = parseAndValidateMarketIntakeModelText(model.text, parsed.currentDraft);
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== ErrorCode.AGENT_INVALID_OUTPUT) {
        throw error;
      }
      const repairPrompt = `${prompt.userPrompt}

上次输出未通过 schema 校验。请重新输出：仅一个 JSON 对象；不要写入 userAcknowledgedLimitedData、metrics 或 MarketInsight；不要 markdown。`;
      const repaired = await generateOnce(repairPrompt);
      model = {
        ...repaired,
        usage: {
          inputTokens: (model.usage.inputTokens ?? 0) + (repaired.usage.inputTokens ?? 0),
          outputTokens: (model.usage.outputTokens ?? 0) + (repaired.usage.outputTokens ?? 0),
          totalTokens: (model.usage.totalTokens ?? 0) + (repaired.usage.totalTokens ?? 0),
          estimatedCost:
            model.usage.estimatedCost == null && repaired.usage.estimatedCost == null
              ? null
              : (model.usage.estimatedCost ?? 0) + (repaired.usage.estimatedCost ?? 0),
        },
      };
      responseMeta = payloadFingerprint(model.text);
      output = parseAndValidateMarketIntakeModelText(model.text, parsed.currentDraft);
    }

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

  private async runReferenceAnalysis(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const parsed = parseReferenceAnalysisInput(request.input);
    const sourceText = [
      parsed.title,
      parsed.userNote,
      parsed.reasonForReference,
      parsed.availableText,
      parsed.availableTranscript,
      parsed.availableDescription,
    ]
      .filter((x): x is string => Boolean(x && x.trim()))
      .join('\n');
    const prompt = this.prompts.render(REFERENCE_ANALYSIS_PROMPT, REFERENCE_ANALYSIS_AGENT_VERSION, {
      referenceContentId: parsed.referenceContentId,
      platform: parsed.platform ?? '',
      sourceType: parsed.sourceType,
      title: parsed.title ?? '',
      reasonForReference: parsed.reasonForReference ?? '',
      userNote: parsed.userNote ?? '',
      availableText: parsed.availableText ?? '',
      availableTranscript: parsed.availableTranscript ?? '',
      availableDescription: parsed.availableDescription ?? '',
      assetMetadata: JSON.stringify(parsed.assetMetadata ?? {}),
    });
    const promptMeta = payloadFingerprint({
      system: prompt.systemPrompt,
      user: prompt.userPrompt,
    });

    const generateOnce = (userPrompt: string) =>
      this.models.generate({
        agentId: definition.id,
        tenantId: request.context.tenantId,
        task: definition.id,
        model: definition.defaultModel,
        temperature: definition.temperature,
        maxTokens: definition.maxTokens,
        timeoutMs: definition.timeoutMs,
        responseFormat: 'json',
        systemPrompt: prompt.systemPrompt,
        prompt: userPrompt,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

    let model = await generateOnce(prompt.userPrompt);
    this.logger.debugPrompt(request.requestId, prompt, { length: model.text.length });
    let responseMeta = payloadFingerprint(model.text);
    let output;
    try {
      output = parseAndValidateReferenceAnalysisModelText(model.text, sourceText);
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== ErrorCode.AGENT_INVALID_OUTPUT) {
        throw error;
      }
      const repairPrompt = `${prompt.userPrompt}

上次输出未通过 schema 校验。请重新输出：仅一个 JSON 对象；不要 exactTitle/exactScript 等复制字段；不要 markdown。`;
      const repaired = await generateOnce(repairPrompt);
      model = {
        ...repaired,
        usage: {
          inputTokens: (model.usage.inputTokens ?? 0) + (repaired.usage.inputTokens ?? 0),
          outputTokens: (model.usage.outputTokens ?? 0) + (repaired.usage.outputTokens ?? 0),
          totalTokens: (model.usage.totalTokens ?? 0) + (repaired.usage.totalTokens ?? 0),
          estimatedCost:
            model.usage.estimatedCost == null && repaired.usage.estimatedCost == null
              ? null
              : (model.usage.estimatedCost ?? 0) + (repaired.usage.estimatedCost ?? 0),
        },
      };
      responseMeta = payloadFingerprint(model.text);
      output = parseAndValidateReferenceAnalysisModelText(model.text, sourceText);
    }

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

  private async runPerformanceAnalysis(
    request: InternalAgentRequest,
    definition: AgentDefinition,
  ): Promise<InternalAgentResponse> {
    const input = request.input as PerformanceAnalysisInputV1;
    const result = runDeterministicPerformanceAnalysis(input);
    this.logger.log({
      requestId: request.requestId,
      agent: definition.id,
      version: definition.version,
      status: 'COMPLETED',
      promptHash: 'none',
      promptLength: 0,
      responseHash: 'deterministic-mock',
      responseLength: 0,
    });
    return {
      status: 'COMPLETED',
      output: result as unknown as JsonObject,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: null },
    };
  }
}

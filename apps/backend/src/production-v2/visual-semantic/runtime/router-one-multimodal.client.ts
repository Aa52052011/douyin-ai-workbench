import { joinOpenAiCompatibleChatCompletionsUrl } from '../../../agents/models/real.provider.js';
import { combineAbortSignals } from '../../../agents/timeout.js';
import type { RealModelConfig } from '../../../agents/models/model.config.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { InferenceCallGuard } from './inference-guard.js';
import { mapVisionHttpError } from './http-error-map.js';
import {
  countImageParts,
  sanitizeRequestLog,
  serializeChatMessages,
  totalImageBytesFromDataUrls,
} from './payload-redaction.js';
import { inspectAssistantContent, parseUsage } from './response-extract.js';
import type {
  MultimodalInvokeInput,
  MultimodalInvokeOptions,
  MultimodalInvokeResult,
  MultimodalModelClient,
} from './multimodal.types.js';

export type RouterOneClientDiagnostics = {
  lastMapped?: ReturnType<typeof mapVisionHttpError>;
  lastHttpStatus?: number;
  lastSanitizedLog?: Record<string, string | number>;
  lastAssistantContentType?: 'string' | 'array' | 'missing' | 'other';
  lastAssistantContentLength?: number;
};

export class RouterOneMultimodalClient implements MultimodalModelClient {
  readonly diagnostics: RouterOneClientDiagnostics = {};

  constructor(
    private readonly config: Pick<RealModelConfig, 'apiKey' | 'baseUrl'>,
    private readonly inferenceGuard: InferenceCallGuard,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async invoke(input: MultimodalInvokeInput, options: MultimodalInvokeOptions): Promise<MultimodalInvokeResult> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      throw new VisualSemanticProviderError('PROVIDER_UNAVAILABLE', 'credential');
    }
    const messages = serializeChatMessages(input.messages, input.images);
    const imageCount = countImageParts(messages);
    if (imageCount < 1 || imageCount > 6) {
      throw new VisualSemanticProviderError('INPUT_INVALID', 'image-count');
    }
    this.inferenceGuard.beforeCall();

    const body = {
      model: input.model,
      messages,
      temperature: 0,
      max_tokens: input.maxTokens ?? 2500,
      response_format: { type: 'json_object' as const },
    };
    this.diagnostics.lastSanitizedLog = sanitizeRequestLog({
      requestId: input.requestId,
      model: input.model,
      numberOfImages: imageCount,
      totalImageBytes: totalImageBytesFromDataUrls(messages),
      timeoutMs: options.timeoutMs,
      responseFormat: input.responseFormat,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const signal = combineAbortSignals([controller.signal, options.abortSignal].filter((item): item is AbortSignal => Boolean(item)));
    const started = Date.now();
    try {
      const response = await this.fetchImpl(joinOpenAiCompatibleChatCompletionsUrl(this.config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      const raw = await response.text();
      const latencyMs = Date.now() - started;
      this.diagnostics.lastHttpStatus = response.status;
      if (!response.ok) {
        const mapped = mapVisionHttpError(response.status, raw);
        this.diagnostics.lastMapped = mapped;
        throw new VisualSemanticProviderError(mapped.code, mapped.category);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        throw new VisualSemanticProviderError('INVALID_PROVIDER_RESPONSE', 'envelope');
      }
      const inspected = inspectAssistantContent(parsed);
      this.diagnostics.lastAssistantContentType = inspected.contentType;
      this.diagnostics.lastAssistantContentLength = inspected.text.length;
      const text = inspected.text;
      if (!text.trim()) {
        throw new VisualSemanticProviderError('INVALID_PROVIDER_RESPONSE', 'empty-content');
      }
      const usageRaw = parseUsage(parsed);
      const finish = (parsed as { choices?: Array<{ finish_reason?: string }> }).choices?.[0]?.finish_reason ?? null;
      return {
        rawText: text,
        latencyMs,
        httpStatus: response.status,
        finishReason: typeof finish === 'string' ? finish : null,
        usage: {
          inputTextUnits: usageRaw.prompt_tokens,
          inputImageUnits: null,
          outputUnits: usageRaw.completion_tokens,
          totalUnits: usageRaw.total_tokens,
          cost: usageRaw.cost,
          costStatus: usageRaw.cost != null ? 'PRICED' : 'UNPRICED',
        },
      };
    } catch (error) {
      if (error instanceof VisualSemanticProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new VisualSemanticProviderError('PROVIDER_TIMEOUT');
      }
      if (error instanceof Error && error.message === 'SMOKE_INFERENCE_LIMIT_EXCEEDED') {
        throw error;
      }
      throw new VisualSemanticProviderError('PROVIDER_UNAVAILABLE', 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}

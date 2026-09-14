import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import type { TokenUsage } from '../agent.types.js';
import { combineAbortSignals, getAgentExecutionAbortSignal } from '../timeout.js';
import { isRealModelConfigured, readModelRouteTimeoutConfig, readRealModelConfig } from './model.config.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Explicit timeoutMs wins (including short mock aborts). Missing timeout uses the primary route budget. */
export function resolveRealModelTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }
  return readModelRouteTimeoutConfig().primaryMs;
}

@Injectable()
export class RealModelProvider implements ModelProvider {
  readonly id = 'real';

  isConfigured(): boolean {
    return isRealModelConfigured();
  }

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const config = readRealModelConfig();
    if (!isRealModelConfigured(config)) {
      throw new AgentError(ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED);
    }

    const controller = new AbortController();
    const timeoutMs = resolveRealModelTimeoutMs(request.timeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = combineAbortSignals(
      [controller.signal, request.abortSignal, getAgentExecutionAbortSignal()].filter(
        (item): item is AbortSignal => Boolean(item),
      ),
    );
    try {
      const response = await fetch(joinOpenAiCompatibleChatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildChatBody(request, config.model)),
        signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new AgentError(
          ErrorCode.MODEL_REQUEST_FAILED,
          `Model request failed (HTTP ${response.status})`,
          response.status >= 500,
          { httpStatus: response.status },
        );
      }

      const parsed = parseChatResponse(raw);
      return {
        text: parsed.text,
        provider: this.id,
        usage: parsed.usage,
      };
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new AgentError(ErrorCode.MODEL_TIMEOUT, undefined, true);
      }
      throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED, undefined, true, networkDetails(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

function buildChatBody(request: ModelGenerateRequest, fallbackModel: string) {
  const messages =
    request.messages ??
    [
      request.systemPrompt ? { role: 'system' as const, content: request.systemPrompt } : null,
      { role: 'user' as const, content: request.prompt },
    ].filter((item): item is { role: 'system' | 'user'; content: string } => item !== null);

  return {
    model: request.model || fallbackModel,
    messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
  };
}

function parseChatResponse(raw: string): { text: string; usage: TokenUsage } {
  let body: ChatCompletionResponse;
  try {
    body = JSON.parse(raw) as ChatCompletionResponse;
  } catch {
    throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED);
  }
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED);
  }
  return {
    text,
    usage: {
      inputTokens: numberOrNull(body.usage?.prompt_tokens),
      outputTokens: numberOrNull(body.usage?.completion_tokens),
      totalTokens: numberOrNull(body.usage?.total_tokens),
      estimatedCost: null,
    },
  };
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function networkDetails(error: unknown): { networkCode?: string } {
  const parts: string[] = [];
  collect(error, parts, 0);
  const hit = parts.join(' ').match(/ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i);
  return hit ? { networkCode: hit[0] } : {};
}

function collect(error: unknown, parts: string[], depth: number): void {
  if (depth > 3 || error == null) {
    return;
  }
  if (typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    parts.push(error.code);
  }
  if (error instanceof Error) {
    parts.push(error.message);
    collect(error.cause, parts, depth + 1);
  }
}

/** OpenAI-compatible Chat Completions URL. Accepts origin or origin+/v1. */
export function joinOpenAiCompatibleChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  const parsed = new URL(trimmed);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname === '' || pathname === '/') {
    pathname = '';
  }
  if (pathname.endsWith('/chat/completions')) {
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  }
  if (!pathname.endsWith('/v1')) {
    pathname = pathname ? `${pathname}/v1` : '/v1';
  }
  return `${parsed.protocol}//${parsed.host}${pathname}/chat/completions`;
}

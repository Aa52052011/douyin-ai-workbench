import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { DEFAULT_AGENT_TIMEOUT_MS, type TokenUsage } from '../agent.types.js';
import { isRealModelConfigured, readRealModelConfig } from './model.config.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

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
    const timeoutMs =
      typeof request.timeoutMs === 'number' && Number.isFinite(request.timeoutMs) && request.timeoutMs > 0
        ? request.timeoutMs
        : DEFAULT_AGENT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildChatBody(request, config.model)),
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED, undefined, response.status >= 500);
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
      throw new AgentError(ErrorCode.MODEL_REQUEST_FAILED, undefined, true);
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

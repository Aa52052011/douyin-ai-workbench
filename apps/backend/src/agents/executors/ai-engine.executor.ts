import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError, isRetryableError } from '../agent.errors.js';
import type { InternalAgentRequest, InternalAgentResponse } from '../agent.types.js';
import { runWithTimeout } from '../timeout.js';
import type { AgentExecutor } from './agent.executor.js';

@Injectable()
export class AiEngineExecutor implements AgentExecutor {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async execute(request: InternalAgentRequest, timeoutMs: number): Promise<InternalAgentResponse> {
    if (!this.secret) {
      throw new AgentError(ErrorCode.AGENT_EXECUTION_FAILED, 'AI Engine secret is not configured');
    }

    return runWithTimeout(() => this.call(request), timeoutMs);
  }

  private async call(request: InternalAgentRequest): Promise<InternalAgentResponse> {
    let response: Response;
    try {
      response = await fetch(`${trimSlash(this.baseUrl)}/internal/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.secret,
          'X-Request-Id': request.requestId,
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new AgentError(
        ErrorCode.AGENT_EXECUTION_FAILED,
        'AI Engine is unreachable',
        isRetryableError(error),
      );
    }

    const body = (await response.json().catch(() => ({}))) as InternalAgentResponse & {
      code?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new AgentError(
        mapRemoteCode(body.code),
        'AI Engine rejected the request',
        response.status >= 500,
      );
    }

    if (body.status === 'FAILED' && body.error) {
      throw new AgentError(mapRemoteCode(body.error.code), body.error.message, body.error.retryable);
    }

    return {
      status: body.status ?? 'COMPLETED',
      output: body.output,
      usage: body.usage,
    };
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function mapRemoteCode(code?: string) {
  switch (code) {
    case ErrorCode.AGENT_NOT_FOUND:
    case ErrorCode.AGENT_INVALID_INPUT:
    case ErrorCode.AGENT_TIMEOUT:
    case ErrorCode.AGENT_INVALID_OUTPUT:
    case ErrorCode.MODEL_ERROR:
    case ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED:
    case ErrorCode.MODEL_REQUEST_FAILED:
    case ErrorCode.MODEL_TIMEOUT:
    case ErrorCode.TOOL_ERROR:
    case ErrorCode.AGENT_CANCELLED:
    case ErrorCode.AGENT_EXECUTION_FAILED:
      return code;
    default:
      return ErrorCode.AGENT_EXECUTION_FAILED;
  }
}

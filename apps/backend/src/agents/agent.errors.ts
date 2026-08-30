import { AppError, ErrorCode, type ErrorCodeValue } from '../common/errors/app-error.js';

const RETRYABLE_CODES = new Set<ErrorCodeValue>([
  ErrorCode.AGENT_TIMEOUT,
  ErrorCode.MODEL_ERROR,
  ErrorCode.AGENT_EXECUTION_FAILED,
]);

const NON_RETRYABLE_CODES = new Set<ErrorCodeValue>([
  ErrorCode.AGENT_NOT_FOUND,
  ErrorCode.AGENT_RUN_NOT_FOUND,
  ErrorCode.AGENT_INVALID_INPUT,
  ErrorCode.AGENT_CANCELLED,
  ErrorCode.AGENT_FORBIDDEN,
  ErrorCode.TOOL_ERROR,
  ErrorCode.AGENT_ASYNC_NOT_IMPLEMENTED,
]);

const NETWORK_RE = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i;

export class AgentError extends AppError {
  readonly retryable: boolean;

  constructor(code: ErrorCodeValue, message?: string, retryable?: boolean) {
    super(code, message);
    this.retryable = retryable ?? isRetryableCode(code);
  }
}

export function isRetryableCode(code: ErrorCodeValue): boolean {
  if (NON_RETRYABLE_CODES.has(code)) {
    return false;
  }
  return RETRYABLE_CODES.has(code);
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AgentError) {
    return error.retryable;
  }
  if (error instanceof AppError) {
    return isRetryableCode(error.code);
  }
  if (error instanceof Error && NETWORK_RE.test(error.message)) {
    return true;
  }
  return false;
}

export function toAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) {
    return error;
  }
  if (error instanceof AppError) {
    return new AgentError(error.code, error.message, isRetryableCode(error.code));
  }
  if (error instanceof Error && NETWORK_RE.test(error.message)) {
    return new AgentError(ErrorCode.AGENT_EXECUTION_FAILED, 'Upstream request failed', true);
  }
  return new AgentError(ErrorCode.AGENT_EXECUTION_FAILED);
}

export function publicAgentErrorMessage(error: AgentError): string {
  return error.message;
}

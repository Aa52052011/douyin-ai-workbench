import { AppError, ErrorCode, type ErrorCodeValue } from '../common/errors/app-error.js';

const RETRYABLE_CODES = new Set<ErrorCodeValue>([
  ErrorCode.AGENT_TIMEOUT,
  ErrorCode.MODEL_ERROR,
  ErrorCode.MODEL_REQUEST_FAILED,
  ErrorCode.MODEL_TIMEOUT,
  ErrorCode.AGENT_EXECUTION_FAILED,
]);

const NON_RETRYABLE_CODES = new Set<ErrorCodeValue>([
  ErrorCode.AGENT_NOT_FOUND,
  ErrorCode.AGENT_RUN_NOT_FOUND,
  ErrorCode.AGENT_INVALID_INPUT,
  ErrorCode.AGENT_INVALID_OUTPUT,
  ErrorCode.AGENT_CANCELLED,
  ErrorCode.AGENT_FORBIDDEN,
  ErrorCode.TOOL_ERROR,
  ErrorCode.AGENT_ASYNC_NOT_IMPLEMENTED,
  ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED,
  ErrorCode.CONTENT_PLAN_DAYS_NOT_AVAILABLE,
  ErrorCode.CONTENT_PLAN_NOT_FOUND,
  ErrorCode.CONTENT_PLAN_CONFLICT,
  ErrorCode.CONTENT_PLAN_POSITIONING_REQUIRED,
  ErrorCode.SCRIPT_NOT_FOUND,
  ErrorCode.SCRIPT_TOPIC_NOT_FOUND,
  ErrorCode.SCRIPT_PLAN_NOT_CONFIRMED,
  ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE,
  ErrorCode.SCRIPT_CONFLICT,
]);

export const MODEL_BUSY_USER_MESSAGE = 'AI 服务暂时繁忙，请稍后重试。';

const NETWORK_RE = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i;

export type AgentErrorDetails = {
  httpStatus?: number;
  networkCode?: string;
};

export class AgentError extends AppError {
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly networkCode?: string;

  constructor(code: ErrorCodeValue, message?: string, retryable?: boolean, details?: AgentErrorDetails) {
    super(code, message);
    this.retryable = retryable ?? isRetryableCode(code);
    this.httpStatus = details?.httpStatus;
    this.networkCode = details?.networkCode;
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

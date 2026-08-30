import { HttpException, HttpStatus } from '@nestjs/common';

export const ErrorCode = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_REFRESH_REVOKED: 'AUTH_REFRESH_REVOKED',
  AUTH_REFRESH_INVALID: 'AUTH_REFRESH_INVALID',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  WORKSPACE_DEFAULT_CANNOT_DELETE: 'WORKSPACE_DEFAULT_CANNOT_DELETE',
  WORKSPACE_NOT_EMPTY: 'WORKSPACE_NOT_EMPTY',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_FORBIDDEN: 'PROJECT_FORBIDDEN',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_RUN_NOT_FOUND: 'AGENT_RUN_NOT_FOUND',
  AGENT_INVALID_INPUT: 'AGENT_INVALID_INPUT',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  MODEL_ERROR: 'MODEL_ERROR',
  TOOL_ERROR: 'TOOL_ERROR',
  AGENT_CANCELLED: 'AGENT_CANCELLED',
  AGENT_FORBIDDEN: 'AGENT_FORBIDDEN',
  AGENT_ASYNC_NOT_IMPLEMENTED: 'AGENT_ASYNC_NOT_IMPLEMENTED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const statusByCode: Record<ErrorCodeValue, HttpStatus> = {
  AUTH_INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  AUTH_UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  AUTH_TOKEN_EXPIRED: HttpStatus.UNAUTHORIZED,
  AUTH_REFRESH_REVOKED: HttpStatus.UNAUTHORIZED,
  AUTH_REFRESH_INVALID: HttpStatus.UNAUTHORIZED,
  AUTH_EMAIL_EXISTS: HttpStatus.CONFLICT,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  WORKSPACE_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORKSPACE_FORBIDDEN: HttpStatus.FORBIDDEN,
  WORKSPACE_DEFAULT_CANNOT_DELETE: HttpStatus.CONFLICT,
  WORKSPACE_NOT_EMPTY: HttpStatus.CONFLICT,
  PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROJECT_FORBIDDEN: HttpStatus.FORBIDDEN,
  AGENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  AGENT_RUN_NOT_FOUND: HttpStatus.NOT_FOUND,
  AGENT_INVALID_INPUT: HttpStatus.BAD_REQUEST,
  AGENT_EXECUTION_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  AGENT_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  MODEL_ERROR: HttpStatus.BAD_GATEWAY,
  TOOL_ERROR: HttpStatus.BAD_GATEWAY,
  AGENT_CANCELLED: HttpStatus.CONFLICT,
  AGENT_FORBIDDEN: HttpStatus.FORBIDDEN,
  AGENT_ASYNC_NOT_IMPLEMENTED: HttpStatus.NOT_IMPLEMENTED,
};

const messageByCode: Record<ErrorCodeValue, string> = {
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_UNAUTHORIZED: 'Authentication required',
  AUTH_TOKEN_EXPIRED: 'Access token expired',
  AUTH_REFRESH_REVOKED: 'Refresh token revoked',
  AUTH_REFRESH_INVALID: 'Refresh token invalid',
  AUTH_EMAIL_EXISTS: 'Email already registered',
  VALIDATION_ERROR: 'Validation failed',
  WORKSPACE_NOT_FOUND: 'Workspace not found',
  WORKSPACE_FORBIDDEN: 'Insufficient permission for workspace',
  WORKSPACE_DEFAULT_CANNOT_DELETE: 'Default workspace cannot be deleted',
  WORKSPACE_NOT_EMPTY: 'Workspace still has projects',
  PROJECT_NOT_FOUND: 'Project not found',
  PROJECT_FORBIDDEN: 'Insufficient permission for project',
  AGENT_NOT_FOUND: 'Agent not found',
  AGENT_RUN_NOT_FOUND: 'Agent run not found',
  AGENT_INVALID_INPUT: 'Agent input is invalid',
  AGENT_EXECUTION_FAILED: 'Agent execution failed',
  AGENT_TIMEOUT: 'Agent execution timed out',
  MODEL_ERROR: 'Model provider error',
  TOOL_ERROR: 'Agent tool error',
  AGENT_CANCELLED: 'Agent run cancelled',
  AGENT_FORBIDDEN: 'Insufficient permission for agent',
  AGENT_ASYNC_NOT_IMPLEMENTED: 'Async agent execution is not available',
};

export class AppError extends HttpException {
  readonly code: ErrorCodeValue;

  constructor(code: ErrorCodeValue, message?: string) {
    super({ code, message: message ?? messageByCode[code] }, statusByCode[code]);
    this.code = code;
  }
}

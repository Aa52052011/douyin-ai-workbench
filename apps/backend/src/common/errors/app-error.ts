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
};

export class AppError extends HttpException {
  readonly code: ErrorCodeValue;

  constructor(code: ErrorCodeValue, message?: string) {
    super({ code, message: message ?? messageByCode[code] }, statusByCode[code]);
    this.code = code;
  }
}

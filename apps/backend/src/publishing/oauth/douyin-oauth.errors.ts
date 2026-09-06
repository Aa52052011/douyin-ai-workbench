import { AppError, ErrorCode, type ErrorCodeValue } from '../../common/errors/app-error.js';

const PUBLIC_DOUYIN_OAUTH_CODES: ErrorCodeValue[] = [
  ErrorCode.DOUYIN_OAUTH_NOT_CONFIGURED,
  ErrorCode.DOUYIN_OAUTH_INVALID_STATE,
  ErrorCode.DOUYIN_OAUTH_STATE_EXPIRED,
  ErrorCode.DOUYIN_OAUTH_INVALID_CODE,
  ErrorCode.DOUYIN_OAUTH_DENIED,
  ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED,
  ErrorCode.DOUYIN_USER_INFO_FAILED,
  ErrorCode.DOUYIN_REAUTH_REQUIRED,
  ErrorCode.PLATFORM_REAUTH_REQUIRED,
  ErrorCode.OAUTH_STATE_STORE_UNAVAILABLE,
  ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND,
  ErrorCode.PLATFORM_ACCOUNT_INACTIVE,
  ErrorCode.SECRET_NOT_FOUND,
  ErrorCode.SECRET_REVOKED,
];

export type DouyinOAuthEndpoint = 'exchange' | 'refresh' | 'userinfo';

export function douyinOAuthError(code: ErrorCodeValue): AppError {
  return new AppError(code);
}

export function mapDouyinProviderErrorCode(errorCode: number, endpoint: DouyinOAuthEndpoint): ErrorCodeValue {
  if (endpoint === 'exchange') {
    if (errorCode === 10007) {
      return ErrorCode.DOUYIN_OAUTH_INVALID_CODE;
    }
    return ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED;
  }
  if (endpoint === 'refresh') {
    if (errorCode === 10007 || errorCode === 10008 || errorCode === 10010 || errorCode === 2190008) {
      return ErrorCode.DOUYIN_REAUTH_REQUIRED;
    }
    return ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED;
  }
  return ErrorCode.DOUYIN_USER_INFO_FAILED;
}

export function sanitizeDouyinOAuthError(error: unknown): AppError {
  if (error instanceof AppError && PUBLIC_DOUYIN_OAUTH_CODES.includes(error.code)) {
    return new AppError(error.code);
  }
  if (isAbortError(error)) {
    return new AppError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
  }
  return new AppError(ErrorCode.DOUYIN_TOKEN_EXCHANGE_FAILED);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function providerErrorCodeFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const nested = record.data;
  if (nested && typeof nested === 'object') {
    const code = (nested as Record<string, unknown>).error_code;
    if (typeof code === 'number' && Number.isFinite(code)) {
      return code;
    }
  }
  if (typeof record.error_code === 'number' && Number.isFinite(record.error_code)) {
    return record.error_code;
  }
  return undefined;
}

export function providerRequestIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const nested = record.data;
  if (nested && typeof nested === 'object') {
    const logId = (nested as Record<string, unknown>).log_id;
    if (typeof logId === 'string' && logId.length > 0) {
      return logId;
    }
  }
  if (typeof record.log_id === 'string' && record.log_id.length > 0) {
    return record.log_id;
  }
  return undefined;
}

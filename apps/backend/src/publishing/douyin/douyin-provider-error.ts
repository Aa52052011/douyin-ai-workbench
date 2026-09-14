export const DOUYIN_RUNTIME_ERRORS = [
  'CONFIG_MISSING',
  'ACCOUNT_NOT_CONNECTED',
  'TOKEN_EXPIRED',
  'REAUTH_REQUIRED',
  'SCOPE_MISSING',
  'CAPABILITY_NOT_APPROVED',
  'CAPABILITY_NOT_CONFIRMED',
  'UPLOAD_REJECTED',
  'FILE_TOO_LARGE',
  'INVALID_VIDEO',
  'CREATE_REJECTED',
  'PLATFORM_REVIEW_REJECTED',
  'RATE_LIMITED',
  'NETWORK_TRANSIENT',
  'UNKNOWN_PROVIDER_ERROR',
  'PUBLICATION_AUTHORIZATION_MISSING',
  'PUBLICATION_AUTHORIZATION_STALE',
  'BLOCK_PUBLICATION_ACTION',
  'BLOCKED_HUMAN_METADATA_APPROVAL',
  'ARTIFACT_ACCEPTANCE_STALE',
  'AMBIGUOUS_CREATE_STATE',
  'LIVE_CALLS_DISABLED',
  'CROSS_TENANT_DENIED',
  'DUPLICATE_CREATE_FORBIDDEN',
  'INVALID_STATE_TRANSITION',
  'FILE_INVALID',
] as const;

export type DouyinRuntimeErrorCode = (typeof DOUYIN_RUNTIME_ERRORS)[number];

export class DouyinProviderError extends Error {
  readonly code: DouyinRuntimeErrorCode;
  readonly officialErrorCode?: number | string;
  readonly description?: string;
  readonly logId?: string;
  readonly endpointName?: string;
  readonly httpStatus?: number;

  constructor(
    code: DouyinRuntimeErrorCode,
    options?: {
      message?: string;
      officialErrorCode?: number | string;
      description?: string;
      logId?: string;
      endpointName?: string;
      httpStatus?: number;
    },
  ) {
    super(options?.message ?? code);
    this.name = 'DouyinProviderError';
    this.code = code;
    this.officialErrorCode = options?.officialErrorCode;
    this.description = options?.description;
    this.logId = options?.logId;
    this.endpointName = options?.endpointName;
    this.httpStatus = options?.httpStatus;
  }
}

export function isDouyinProviderError(error: unknown): error is DouyinProviderError {
  return error instanceof DouyinProviderError;
}

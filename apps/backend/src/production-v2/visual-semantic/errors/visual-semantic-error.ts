export const VISUAL_SEMANTIC_PROVIDER_ERROR_CODES = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'INVALID_PROVIDER_RESPONSE',
  'SCHEMA_VALIDATION_FAILED',
  'UNSUPPORTED_CAPABILITY',
  'INPUT_INVALID',
  'CONTENT_REJECTED',
  'UNKNOWN_PROVIDER_ERROR',
] as const;
export type VisualSemanticProviderErrorCode = (typeof VISUAL_SEMANTIC_PROVIDER_ERROR_CODES)[number];

const RETRYABLE: Record<VisualSemanticProviderErrorCode, boolean> = {
  PROVIDER_UNAVAILABLE: true,
  PROVIDER_TIMEOUT: true,
  INVALID_PROVIDER_RESPONSE: false,
  SCHEMA_VALIDATION_FAILED: false,
  UNSUPPORTED_CAPABILITY: false,
  INPUT_INVALID: false,
  CONTENT_REJECTED: false,
  UNKNOWN_PROVIDER_ERROR: false,
};

const SAFE_MESSAGES: Record<VisualSemanticProviderErrorCode, string> = {
  PROVIDER_UNAVAILABLE: 'Visual semantic provider unavailable',
  PROVIDER_TIMEOUT: 'Visual semantic provider timed out',
  INVALID_PROVIDER_RESPONSE: 'Visual semantic provider response invalid',
  SCHEMA_VALIDATION_FAILED: 'Visual semantic schema validation failed',
  UNSUPPORTED_CAPABILITY: 'Visual semantic capability unsupported',
  INPUT_INVALID: 'Visual semantic input invalid',
  CONTENT_REJECTED: 'Visual semantic content rejected',
  UNKNOWN_PROVIDER_ERROR: 'Visual semantic provider error',
};

export class VisualSemanticProviderError extends Error {
  readonly code: VisualSemanticProviderErrorCode;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly debugLabel?: string;

  constructor(code: VisualSemanticProviderErrorCode, detail?: string) {
    super(SAFE_MESSAGES[code]);
    this.name = 'VisualSemanticProviderError';
    this.code = code;
    this.safeMessage = SAFE_MESSAGES[code];
    this.retryable = RETRYABLE[code];
    this.debugLabel = detail;
  }

  toJSON(): { code: VisualSemanticProviderErrorCode; safeMessage: string; retryable: boolean } {
    return { code: this.code, safeMessage: this.safeMessage, retryable: this.retryable };
  }
}

export function isRetryableProviderError(code: VisualSemanticProviderErrorCode): boolean {
  return RETRYABLE[code];
}

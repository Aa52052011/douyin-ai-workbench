const ALLOWED_METADATA_KEYS = new Set([
  'providerRequestId',
  'requestId',
  'providerUploadId',
  'uploadId',
  'providerItemId',
  'itemId',
  'externalPostId',
  'videoId',
  'errorCode',
  'status',
  'retryClass',
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'clientSecret',
  'authorization',
  'Authorization',
  'token',
  'cipher',
  'masterKey',
  'cookie',
  'Cookie',
  'set-cookie',
  'Set-Cookie',
]);

export function sanitizeProviderResponseMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      continue;
    }
    if (!ALLOWED_METADATA_KEYS.has(key)) {
      continue;
    }
    if (nested == null || typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
      next[key] = nested;
    }
  }
  return next;
}

export function assertNoSecretMetadata(value: unknown): void {
  const text = JSON.stringify(value ?? {});
  for (const key of FORBIDDEN_METADATA_KEYS) {
    if (text.includes(`"${key}"`)) {
      throw new Error(`Secret metadata key leaked: ${key}`);
    }
  }
}

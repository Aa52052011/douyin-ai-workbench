const ALLOWED_METADATA_KEYS = new Set([
  'providerRequestId',
  'requestId',
  'providerSnapshotId',
  'snapshotId',
  'apiVersion',
  'mappingVersion',
  'errorCode',
  'status',
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
  'credentialRef',
  'password',
  'secret',
  'passwd',
]);

const FORBIDDEN_LOWER = new Set([...FORBIDDEN_METADATA_KEYS].map((key) => key.toLowerCase()));

export function sanitizeMetricsProviderMetadata(value: unknown): Record<string, unknown> {
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

export function metricsMetadataContainsSecrets(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key) || FORBIDDEN_LOWER.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function assertNoSecretMetricsMetadata(value: unknown): void {
  const text = JSON.stringify(value ?? {});
  for (const key of FORBIDDEN_METADATA_KEYS) {
    if (text.includes(`"${key}"`)) {
      throw new Error(`Secret metadata key leaked: ${key}`);
    }
  }
}

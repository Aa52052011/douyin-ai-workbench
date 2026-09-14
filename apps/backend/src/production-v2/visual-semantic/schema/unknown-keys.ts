const FORBIDDEN_DECISION_KEYS = new Set([
  'assetUsage',
  'usageAssessment',
  'bestCrop',
  'finalCrop',
  'safeToCrop',
  'recommendedCrop',
  'finalRelevance',
  'projectRelevance',
]);

const FORBIDDEN_SECRET_KEYS = new Set([
  'apiKey',
  'api_key',
  'authorization',
  'Authorization',
  'bearer',
  'jwt',
  'JWT',
  'password',
  'secret',
  'DATABASE_URL',
  'privateKey',
  'accessToken',
  'env',
  '.env',
  'absolutePath',
  'filesystemDump',
]);

export function collectForbiddenKeys(value: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (!value || typeof value !== 'object') {
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...collectForbiddenKeys(item, `${path}[${i}]`)));
    return hits;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_DECISION_KEYS.has(key) || FORBIDDEN_SECRET_KEYS.has(key)) {
      hits.push(here);
    }
    hits.push(...collectForbiddenKeys(child, here));
  }
  return hits;
}

export function assertNoForbiddenKeys(value: unknown): void {
  const hits = collectForbiddenKeys(value);
  if (hits.length > 0) {
    throw new Error(`FORBIDDEN_KEYS:${hits.join(',')}`);
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function assertAllowedKeys(obj: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extra = Object.keys(obj).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw new Error(`${label}:unknown:${extra.join(',')}`);
  }
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}:string`);
  }
  return value;
}

export function asFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}:number`);
  }
  return value;
}

export function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label}:boolean`);
  }
  return value;
}

export function asEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label}:enum`);
  }
  return value as T;
}

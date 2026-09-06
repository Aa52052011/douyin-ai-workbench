export const IMPORT_COLLECTION_KEY_PREFIX = 'import:';

export const IMPORT_METRICS_PROVIDERS = [
  'CSV_IMPORT',
  'XLSX_IMPORT',
  'DESKTOP_ASSISTED',
  'STRUCTURED_IMPORT',
] as const;

export type ImportMetricsProvider = (typeof IMPORT_METRICS_PROVIDERS)[number];

const IMPORT_PROVIDER_SET = new Set<string>(IMPORT_METRICS_PROVIDERS);

const BLOCKED_API_SPOOF_PROVIDERS = new Set(
  [
    'API',
    'MOCK',
    'MANUAL',
    'DOUYIN',
    'TIKTOK',
    'YOUTUBE',
    'XIAOHONGSHU',
    'BILIBILI',
    'CHANNELS',
    'OFFICIAL_API',
    'DOUYIN_API',
    'OPENAPI',
  ].map((name) => name.toUpperCase()),
);

export function isAllowedImportMetricsProvider(provider: string): provider is ImportMetricsProvider {
  return IMPORT_PROVIDER_SET.has(provider);
}

export function isApiSpoofImportProvider(provider: string): boolean {
  return BLOCKED_API_SPOOF_PROVIDERS.has(provider.trim().toUpperCase());
}

export function importCollectionKey(idempotencyKey: string): string {
  return `${IMPORT_COLLECTION_KEY_PREFIX}${idempotencyKey}`;
}

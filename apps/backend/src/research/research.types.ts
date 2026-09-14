import { createHash } from 'node:crypto';

export const RESEARCH_ADAPTER_TYPES = [
  'OFFICIAL_API',
  'LICENSED_PROVIDER',
  'CONNECTOR',
  'PUBLIC_RESEARCH',
  'MANUAL',
  'SYSTEM_INTERNAL',
] as const;
export type ResearchAdapterType = (typeof RESEARCH_ADAPTER_TYPES)[number];

export const AUTONOMOUS_RESEARCH_NOT_CONFIGURED = 'AUTONOMOUS_RESEARCH_NOT_CONFIGURED';

export type ResearchQueryContext = {
  businessGoal?: string;
  productSummary?: string;
  industry?: string;
  audience?: string;
  positioning?: string;
  strategySummary?: string;
  keywords: string[];
  competitors: string[];
  seedUrls: string[];
  contentGaps?: string[];
};

export type AdapterResearchRequest = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  platform: string;
  queryContext: ResearchQueryContext;
  seedKeywords: string[];
  seedCompetitors: string[];
  seedUrls: string[];
};

export type NormalizedResearchEvidence = {
  sourceType: string;
  platform: string;
  origin: 'SYSTEM_DISCOVERED' | 'USER_PROVIDED' | 'PLATFORM_API';
  externalId?: string;
  canonicalUrl?: string;
  title?: string;
  textSummary?: string;
  rawPayload?: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  capturedAt: string;
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
  provenance: string;
  referenceOnly: boolean;
  displayAllowed: boolean;
  analysisAllowed: boolean;
  rightsStatus?: string;
  sourcePolicy?: string;
};

export type AdapterDiscoverResult = {
  configured: boolean;
  code?: string;
  seeds?: string[];
  failures?: Array<{ source: string; reason: string }>;
};

export type AdapterFetchResult = {
  configured: boolean;
  code?: string;
  evidence: NormalizedResearchEvidence[];
  failures: Array<{ source: string; reason: string }>;
};

export type ResearchAdapterCapabilities = {
  id: string;
  adapterType: ResearchAdapterType;
  platforms: string[];
  productionAvailable: boolean;
  sourcePolicy: string;
  dataRights: string;
  displayAllowed: boolean;
  analysisAllowed: boolean;
  retentionPolicy: string;
};

export interface MarketResearchSourceAdapter {
  getCapabilities(): ResearchAdapterCapabilities;
  canHandle(request: AdapterResearchRequest): boolean;
  discover(request: AdapterResearchRequest): Promise<AdapterDiscoverResult>;
  fetchEvidence(request: AdapterResearchRequest): Promise<AdapterFetchResult>;
  normalizeEvidence(raw: unknown): NormalizedResearchEvidence | null;
}

export type ResearchJobContract = {
  kind: 'MARKET_RESEARCH';
  researchRequestId: string;
  tenantId: string;
  projectId: string;
};

export function researchContentHash(input: {
  platform: string;
  externalId?: string | null;
  canonicalUrl?: string | null;
  title?: string | null;
  textSummary?: string | null;
}): string {
  const raw = [
    input.platform.trim().toLowerCase(),
    (input.externalId ?? '').trim(),
    (input.canonicalUrl ?? '').trim().toLowerCase(),
    (input.title ?? '').trim(),
    (input.textSummary ?? '').trim(),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function researchQueryHash(input: {
  platform: string;
  keywords: string[];
  competitors: string[];
  urls: string[];
  adapterVersion: string;
  timeBucket: string;
  refreshNonce?: string;
}): string {
  const body = JSON.stringify({
    platform: input.platform,
    keywords: [...input.keywords].map((item) => item.trim().toLowerCase()).filter(Boolean).sort(),
    competitors: [...input.competitors].map((item) => item.trim().toLowerCase()).filter(Boolean).sort(),
    urls: [...input.urls].map((item) => item.trim().toLowerCase()).filter(Boolean).sort(),
    adapterVersion: input.adapterVersion,
    timeBucket: input.timeBucket,
    refreshNonce: input.refreshNonce ?? '',
  });
  return createHash('sha256').update(body).digest('hex').slice(0, 40);
}

export function utcDayBucket(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function evidenceAgeDays(capturedAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - capturedAt.getTime()) / 86_400_000));
}

export function freshnessLabel(ageDays: number | null): string {
  if (ageDays == null) return 'NONE';
  if (ageDays <= 7) return 'FRESH';
  if (ageDays <= 30) return 'AGING';
  return 'STALE';
}

export function toPublicResearchView(input: {
  id: string;
  status: string;
  platform: string;
  requestedAt: Date;
  completedAt: Date | null;
  evidenceCount: number;
  sourceCount: number;
  coverage: { keywordsCovered: number; competitorsCovered: number; videosCovered: number; commentsCovered: number } | null;
  limitationSummary: string;
}): {
  id: string;
  statusLabel: string;
  sourceCount: number;
  evidenceCount: number;
  lastUpdatedAt: string;
  coverageSummary: string;
  limitationSummary: string;
} {
  return {
    id: input.id,
    statusLabel: researchStatusLabel(input.status),
    sourceCount: input.sourceCount,
    evidenceCount: input.evidenceCount,
    lastUpdatedAt: (input.completedAt ?? input.requestedAt).toISOString(),
    coverageSummary: coverageSummary(input.coverage),
    limitationSummary: input.limitationSummary,
  };
}

export function researchStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return '待研究';
    case 'RUNNING':
      return '研究中';
    case 'COMPLETED':
      return '已完成';
    case 'PARTIAL':
      return '部分完成';
    case 'FAILED':
      return '失败';
    case 'CANCELLED':
      return '已取消';
    case 'NOT_CONFIGURED':
      return '自动市场研究服务尚未配置';
    default:
      return '未知';
  }
}

function coverageSummary(
  coverage: { keywordsCovered: number; competitorsCovered: number; videosCovered: number; commentsCovered: number } | null,
): string {
  if (!coverage) {
    return '当前没有系统采集覆盖统计';
  }
  return `关键词 ${coverage.keywordsCovered} · 竞品 ${coverage.competitorsCovered} · 视频 ${coverage.videosCovered} · 评论 ${coverage.commentsCovered}`;
}

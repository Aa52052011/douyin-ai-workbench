import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEEDBACK_PUBLICATION_LIMIT,
  MAX_FEEDBACK_JSON_BYTES,
  MAX_PUBLICATION_IDS_PER_SIGNAL,
  MAX_REPRESENTATIVE_EVIDENCE,
} from './performance-feedback.constants.js';
import {
  aggregateConfidence,
  buildPerformanceFeedback,
  selectRecentPublishedPublications,
  type FeedbackPublicationSource,
} from './performance-feedback.builder.js';
import type { CompactPerformanceFeedback } from './performance-feedback.types.js';
import type { InsightCode, PerformanceInsight, PublicationPerformanceInsightResult } from './performance-insight.types.js';
import type { DataSufficiency } from './performance-insight.types.js';

const GENERATED = new Date('2026-08-10T00:00:00.000Z');
const SCOPE = {
  tenantId: 'tenant-a',
  workspaceId: 'ws-a',
  projectId: 'proj-a',
};

function insightOf(
  code: InsightCode,
  opts: Partial<PerformanceInsight> & { publicationId?: string } = {},
): PerformanceInsight {
  const category =
    code.startsWith('HIGH_') || code.startsWith('LOW_')
      ? 'ENGAGEMENT'
      : code.includes('COMPLETION')
        ? 'RETENTION'
        : 'DATA_QUALITY';
  return {
    code,
    category,
    severity: code.startsWith('HIGH_') || code.startsWith('STRONG_') ? 'POSITIVE' : code.startsWith('LOW_') || code.startsWith('WEAK_') ? 'WARNING' : 'INFO',
    confidence: opts.confidence ?? 'HIGH',
    window: opts.window ?? 'H24',
    messageKey: `performanceInsight.v1.${code}`,
    evidence: opts.evidence ?? [
      {
        metric: code.includes('SHARE') ? 'shareRate' : code.includes('LIKE') ? 'likeRate' : 'engagementRate',
        value: 0.08,
        comparator: '>=',
        threshold: 0.05,
        views: 1000,
        observationCoverage: 1,
        snapshotCount: 3,
        windowObservedAt: new Date('2026-08-01T20:00:00.000Z'),
        snapshotId: 'snap-1',
      },
    ],
  };
}

function source(
  publicationId: string,
  dataSufficiency: DataSufficiency,
  codes: InsightCode[],
  extra?: { title?: string; confidence?: PerformanceInsight['confidence'] },
): FeedbackPublicationSource {
  const insights = codes.map((code) => insightOf(code, { confidence: extra?.confidence }));
  const result: PublicationPerformanceInsightResult = {
    publicationId,
    generatedAt: GENERATED,
    rulesVersion: 'v1',
    summaryGeneratedAt: GENERATED,
    dataSufficiency,
    insights,
  };
  return {
    publicationId,
    title: extra?.title,
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    insight: result,
  };
}

function feedback(publications: FeedbackPublicationSource[]): CompactPerformanceFeedback {
  return buildPerformanceFeedback({ publications, generatedAt: GENERATED });
}

describe('buildPerformanceFeedback', () => {
  it('returns NONE when there are no publications', () => {
    const result = feedback([]);
    expect(result.dataState).toBe('NONE');
    expect(result.sampleSize).toBe(0);
    expect(result.positiveSignals).toEqual([]);
    expect(result.version).toBe('v1');
    expect(result.avoidOvergeneralization).toBe(true);
  });

  it('returns LIMITED when publications exist but none are sufficient', () => {
    const result = feedback([
      source('p1', 'INSUFFICIENT', ['INSUFFICIENT_DATA']),
      source('p2', 'INSUFFICIENT', ['INSUFFICIENT_DATA']),
    ]);
    expect(result.dataState).toBe('LIMITED');
    expect(result.dataQuality.insufficientCount).toBe(2);
    expect(result.positiveSignals).toEqual([]);
  });

  it('keeps a single positive insight out of main signals', () => {
    const result = feedback([source('p1', 'SUFFICIENT', ['HIGH_SHARE_RATE'])]);
    expect(result.dataState).toBe('LIMITED');
    expect(result.positiveSignals).toEqual([]);
    expect(result.sampleSize).toBe(1);
  });

  it('aggregates the same positive code across two publications', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_SHARE_RATE']),
      source('p2', 'SUFFICIENT', ['HIGH_SHARE_RATE']),
    ]);
    expect(result.positiveSignals).toHaveLength(1);
    expect(result.positiveSignals[0]?.code).toBe('HIGH_SHARE_RATE');
    expect(result.positiveSignals[0]?.supportCount).toBe(2);
    expect(result.dataState).toBe('USABLE');
  });

  it('emits one signal rather than duplicates for three publications', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_LIKE_RATE']),
      source('p2', 'SUFFICIENT', ['HIGH_LIKE_RATE']),
      source('p3', 'SUFFICIENT', ['HIGH_LIKE_RATE']),
    ]);
    expect(result.positiveSignals.map((row) => row.code)).toEqual(['HIGH_LIKE_RATE']);
    expect(result.positiveSignals[0]?.supportCount).toBe(3);
  });

  it('aggregates a repeated caution signal', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['LOW_ENGAGEMENT_RATE']),
      source('p2', 'SUFFICIENT', ['LOW_ENGAGEMENT_RATE']),
    ]);
    expect(result.cautionSignals.map((row) => row.code)).toEqual(['LOW_ENGAGEMENT_RATE']);
    expect(result.positiveSignals).toEqual([]);
  });

  it('keeps mixed positive and negative signals and marks inconsistent performance', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_ENGAGEMENT_RATE']),
      source('p2', 'SUFFICIENT', ['HIGH_ENGAGEMENT_RATE']),
      source('p3', 'SUFFICIENT', ['LOW_ENGAGEMENT_RATE']),
      source('p4', 'SUFFICIENT', ['LOW_ENGAGEMENT_RATE']),
    ]);
    expect(result.positiveSignals.map((row) => row.code)).toContain('HIGH_ENGAGEMENT_RATE');
    expect(result.cautionSignals.map((row) => row.code)).toContain('LOW_ENGAGEMENT_RATE');
    expect(result.inconsistentPerformance).toBe(true);
    expect(result.dataState).toBe('MIXED');
  });

  it('separates data quality insights from performance signals', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_SHARE_RATE', 'MIXED_SOURCE_DATA']),
      source('p2', 'SUFFICIENT', ['HIGH_SHARE_RATE', 'MIXED_SOURCE_DATA']),
    ]);
    expect(result.positiveSignals.map((row) => row.code)).toEqual(['HIGH_SHARE_RATE']);
    expect(result.dataQualitySignals.map((row) => row.code)).toEqual(['MIXED_SOURCE_DATA']);
    expect(result.positiveSignals[0]?.code).not.toBe('MIXED_SOURCE_DATA');
  });

  it('excludes INSUFFICIENT publications from performance signals', () => {
    const result = feedback([
      source('p1', 'INSUFFICIENT', ['HIGH_SHARE_RATE', 'INSUFFICIENT_DATA']),
      source('p2', 'INSUFFICIENT', ['HIGH_SHARE_RATE', 'INSUFFICIENT_DATA']),
    ]);
    expect(result.positiveSignals).toEqual([]);
    expect(result.dataQuality.insufficientCount).toBe(2);
  });

  it('allows PARTIAL publications to contribute positive signals but stays LIMITED without a second sufficient pub', () => {
    const result = feedback([
      source('p1', 'PARTIAL', ['HIGH_LIKE_RATE']),
      source('p2', 'PARTIAL', ['HIGH_LIKE_RATE']),
    ]);
    expect(result.positiveSignals[0]?.supportCount).toBe(2);
    expect(result.dataQuality.partialCount).toBe(2);
    expect(result.dataState).toBe('LIMITED');
  });

  it('aggregates confidence deterministically', () => {
    expect(aggregateConfidence(['HIGH', 'HIGH'], 2)).toBe('HIGH');
    expect(aggregateConfidence(['HIGH', 'MEDIUM'], 2)).toBe('MEDIUM');
    expect(aggregateConfidence(['HIGH', 'LOW'], 3)).toBe('LOW');
    const mixed = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_SHARE_RATE'], { confidence: 'HIGH' }),
      source('p2', 'SUFFICIENT', ['HIGH_SHARE_RATE'], { confidence: 'MEDIUM' }),
    ]);
    expect(mixed.positiveSignals[0]?.confidence).toBe('MEDIUM');
  });

  it('orders signals by support, then confidence, then code', () => {
    const result = feedback([
      source('p1', 'SUFFICIENT', ['HIGH_SHARE_RATE', 'HIGH_LIKE_RATE', 'HIGH_COMMENT_RATE']),
      source('p2', 'SUFFICIENT', ['HIGH_SHARE_RATE', 'HIGH_LIKE_RATE', 'HIGH_COMMENT_RATE']),
      source('p3', 'SUFFICIENT', ['HIGH_SHARE_RATE']),
    ]);
    expect(result.positiveSignals.map((row) => row.code)).toEqual([
      'HIGH_SHARE_RATE',
      'HIGH_COMMENT_RATE',
      'HIGH_LIKE_RATE',
    ]);
  });

  it('limits selected publications to the default cap and prefers the most recent', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `p${String(index).padStart(2, '0')}`,
      tenantId: SCOPE.tenantId,
      workspaceId: SCOPE.workspaceId,
      projectId: SCOPE.projectId,
      status: 'PUBLISHED',
      publishedAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
      createdAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T01:00:00.000Z`),
    }));
    const selected = selectRecentPublishedPublications(rows, SCOPE);
    expect(selected).toHaveLength(DEFAULT_FEEDBACK_PUBLICATION_LIMIT);
    expect(selected[0]?.id).toBe('p11');
    expect(selected[9]?.id).toBe('p02');
  });

  it('only keeps same tenant/workspace/project published rows', () => {
    const selected = selectRecentPublishedPublications(
      [
        {
          id: 'keep',
          tenantId: SCOPE.tenantId,
          workspaceId: SCOPE.workspaceId,
          projectId: SCOPE.projectId,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-08-02T00:00:00.000Z'),
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
        },
        {
          id: 'other-project',
          tenantId: SCOPE.tenantId,
          workspaceId: SCOPE.workspaceId,
          projectId: 'proj-b',
          status: 'PUBLISHED',
          publishedAt: new Date('2026-08-03T00:00:00.000Z'),
          createdAt: new Date('2026-08-03T00:00:00.000Z'),
        },
        {
          id: 'other-ws',
          tenantId: SCOPE.tenantId,
          workspaceId: 'ws-b',
          projectId: SCOPE.projectId,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-08-03T00:00:00.000Z'),
          createdAt: new Date('2026-08-03T00:00:00.000Z'),
        },
        {
          id: 'other-tenant',
          tenantId: 'tenant-b',
          workspaceId: SCOPE.workspaceId,
          projectId: SCOPE.projectId,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-08-03T00:00:00.000Z'),
          createdAt: new Date('2026-08-03T00:00:00.000Z'),
        },
        {
          id: 'draft',
          tenantId: SCOPE.tenantId,
          workspaceId: SCOPE.workspaceId,
          projectId: SCOPE.projectId,
          status: 'DRAFT',
          publishedAt: new Date('2026-08-03T00:00:00.000Z'),
          createdAt: new Date('2026-08-03T00:00:00.000Z'),
        },
      ],
      SCOPE,
    );
    expect(selected.map((row) => row.id)).toEqual(['keep']);
  });

  it('limits representative evidence and publicationIds', () => {
    const publications = Array.from({ length: 8 }, (_, index) =>
      source(`pub-${index}`, 'SUFFICIENT', ['HIGH_FAVORITE_RATE'], { title: `Title ${index}` }),
    );
    const result = feedback(publications);
    expect(result.positiveSignals[0]?.publicationIds).toHaveLength(MAX_PUBLICATION_IDS_PER_SIGNAL);
    expect(result.positiveSignals[0]?.representativeEvidence).toHaveLength(MAX_REPRESENTATIVE_EVIDENCE);
  });

  it('keeps the compact JSON payload bounded and free of raw snapshot fields', () => {
    const publications = Array.from({ length: 10 }, (_, index) =>
      source(`pub-${index}`, 'SUFFICIENT', [
        'HIGH_LIKE_RATE',
        'HIGH_SHARE_RATE',
        'HIGH_COMMENT_RATE',
        'STRONG_COMPLETION_RATE',
        'MIXED_SOURCE_DATA',
      ]),
    );
    const result = feedback(publications);
    const json = JSON.stringify(result);
    expect(Buffer.byteLength(json, 'utf8')).toBeLessThanOrEqual(MAX_FEEDBACK_JSON_BYTES);
    expect(json).not.toContain('collectionKey');
    expect(json).not.toContain('providerMetadata');
    expect(json).not.toContain('sourceJobId');
    expect(json).not.toMatch(/windows":\{"H24"/);
  });
});

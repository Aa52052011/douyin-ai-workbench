import { emptyPerformanceFeedback } from '../metrics/performance-feedback.builder.js';
import type { CompactFeedbackSignal, CompactPerformanceFeedback } from '../metrics/performance-feedback.types.js';
import { describe, expect, it } from 'vitest';
import {
  buildLearningSignalsFromPerformanceFeedback,
  learningStatusLabel,
  learningWatermark,
  recommendationsFromSignals,
} from './learning-signals.js';
import { researchContentHash, researchQueryHash, utcDayBucket } from './research.types.js';
import { DisabledMarketResearchAdapter } from './disabled-research.adapter.js';
import { MockMarketResearchAdapter } from './mock-research.adapter.js';
import { AutonomousResearchService } from './autonomous-research.service.js';
import { LearningService } from './learning.service.js';

function signal(partial: Partial<CompactFeedbackSignal> & Pick<CompactFeedbackSignal, 'code' | 'publicationIds'>): CompactFeedbackSignal {
  return {
    category: 'ENGAGEMENT',
    confidence: 'MEDIUM',
    supportCount: partial.publicationIds.length,
    representativeEvidence: [{ metric: 'likeRate', value: 0.1, threshold: 0.05, window: null }],
    ...partial,
  };
}

function feedback(partial: Partial<CompactPerformanceFeedback>): CompactPerformanceFeedback {
  return {
    ...emptyPerformanceFeedback(),
    dataState: 'USABLE',
    sampleSize: 2,
    publicationsConsidered: 2,
    ...partial,
  };
}

describe('research identity', () => {
  it('dedupes canonical URL and external id via content hash', () => {
    const a = researchContentHash({ platform: 'douyin', canonicalUrl: 'https://www.douyin.com/video/1', externalId: '1' });
    const b = researchContentHash({ platform: 'douyin', canonicalUrl: 'https://www.douyin.com/video/1', externalId: '1' });
    const c = researchContentHash({ platform: 'douyin', canonicalUrl: 'https://www.douyin.com/video/2', externalId: '2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('keeps same-day query hash stable and refresh nonce distinct', () => {
    const base = { platform: 'douyin', keywords: ['a'], competitors: [], urls: [], adapterVersion: 'disabled', timeBucket: utcDayBucket() };
    expect(researchQueryHash(base)).toBe(researchQueryHash(base));
    expect(researchQueryHash({ ...base, refreshNonce: '1' })).not.toBe(researchQueryHash(base));
  });
});

describe('research adapters', () => {
  it('disabled adapter is not production-capable and returns no evidence', async () => {
    const adapter = new DisabledMarketResearchAdapter();
    expect(adapter.getCapabilities().productionAvailable).toBe(false);
    const fetched = await adapter.fetchEvidence({
      id: 'r',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      platform: 'douyin',
      queryContext: { keywords: [], competitors: [], seedUrls: [] },
      seedKeywords: [],
      seedCompetitors: [],
      seedUrls: [],
    });
    expect(fetched.configured).toBe(false);
    expect(fetched.evidence).toEqual([]);
  });

  it('mock adapter can return partial evidence for tests only', async () => {
    const ok = {
      sourceType: 'DOUYIN_VIDEO_URL',
      platform: 'douyin',
      origin: 'SYSTEM_DISCOVERED' as const,
      externalId: '1',
      canonicalUrl: 'https://www.douyin.com/video/1',
      title: 'a',
      capturedAt: '2026-09-01T00:00:00.000Z',
      confidence: 'LOW' as const,
      provenance: 'SYSTEM_DISCOVERED',
      referenceOnly: true,
      displayAllowed: false,
      analysisAllowed: true,
      normalizedPayload: {},
    };
    const adapter = new MockMarketResearchAdapter([ok, { ...ok, externalId: '2', canonicalUrl: 'https://www.douyin.com/video/2', title: 'b' }]);
    expect(adapter.getCapabilities().productionAvailable).toBe(false);
    const fetched = await adapter.fetchEvidence({
      id: 'r',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      platform: 'douyin',
      queryContext: { keywords: [], competitors: [], seedUrls: [] },
      seedKeywords: [],
      seedCompetitors: [],
      seedUrls: [],
    });
    expect(fetched.evidence).toHaveLength(2);
  });
});

describe('learning signals', () => {
  it('treats n=1 as candidate TEST_MORE, never INCREASE', () => {
    const signals = buildLearningSignalsFromPerformanceFeedback(
      feedback({
        sampleSize: 1,
        publicationsConsidered: 1,
        positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['pub-1'] })],
      }),
    );
    expect(signals[0]?.status).toBe('candidate');
    expect(signals[0]?.supportCount).toBe(1);
    const recs = recommendationsFromSignals(signals);
    expect(recs.every((item) => item.action === 'TEST_MORE' || item.action === 'KEEP')).toBe(true);
    expect(recs.some((item) => item.action === 'INCREASE')).toBe(false);
    expect(learningStatusLabel({ sampleSize: 1, confirmed: 0, candidate: 1 })).toBe(
      '出现初步迹象，系统会继续观察。',
    );
    expect(learningStatusLabel({ sampleSize: 2, confirmed: 1, candidate: 0 })).toBe('已有多次数据支持');
  });

  it('confirms support>=2 independent publications', () => {
    const signals = buildLearningSignalsFromPerformanceFeedback(
      feedback({
        positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['pub-1', 'pub-2'] })],
      }),
    );
    expect(signals[0]?.status).toBe('confirmed');
    expect(signals[0]?.supportCount).toBe(2);
    expect(recommendationsFromSignals(signals).some((item) => item.action === 'INCREASE')).toBe(true);
  });

  it('does not inflate support on duplicate refresh of the same publications', () => {
    const fb = feedback({
      generatedAt: '2026-09-10T00:00:00.000Z',
      positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['pub-1', 'pub-2'] })],
    });
    const first = buildLearningSignalsFromPerformanceFeedback(fb);
    const second = buildLearningSignalsFromPerformanceFeedback(fb);
    expect(first[0]?.supportCount).toBe(second[0]?.supportCount);
    expect(learningWatermark(fb)).toBe(learningWatermark({ ...fb }));
    expect(
      learningWatermark({
        ...fb,
        generatedAt: '2026-09-10T00:00:01.000Z',
      }),
    ).toBe(learningWatermark(fb));
  });

  it('does not invent conversion signals without those metrics', () => {
    const signals = buildLearningSignalsFromPerformanceFeedback(
      feedback({
        positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['pub-1', 'pub-2'] })],
      }),
    );
    expect(signals.some((item) => item.key.includes('FOLLOW_GROWTH') || item.key.includes('SALES'))).toBe(false);
  });

  it('keeps a single negative as candidate and requires more evidence for AVOID', () => {
    const one = buildLearningSignalsFromPerformanceFeedback(
      feedback({
        sampleSize: 1,
        cautionSignals: [signal({ code: 'LOW_ENGAGEMENT_RATE', publicationIds: ['pub-1'] })],
      }),
    );
    expect(one[0]?.status).toBe('candidate');
    expect(recommendationsFromSignals(one).some((item) => item.action === 'AVOID')).toBe(false);
    const two = buildLearningSignalsFromPerformanceFeedback(
      feedback({
        sampleSize: 2,
        cautionSignals: [signal({ code: 'LOW_ENGAGEMENT_RATE', publicationIds: ['pub-1', 'pub-2'] })],
      }),
    );
    expect(two[0]?.status).toBe('confirmed');
    expect(recommendationsFromSignals(two).some((item) => item.action === 'AVOID')).toBe(false);
  });

  it('requires two publications for confirmed reference pattern', () => {
    const one = buildLearningSignalsFromPerformanceFeedback(feedback({ sampleSize: 1 }), {
      referencePatternByPublication: { 'pub-1': ['pat-1'] },
    });
    expect(one.find((item) => item.signalType === 'REFERENCE_PATTERN')?.status).toBe('candidate');
    const two = buildLearningSignalsFromPerformanceFeedback(feedback({ sampleSize: 2 }), {
      referencePatternByPublication: { 'pub-1': ['pat-1'], 'pub-2': ['pat-1'] },
    });
    expect(two.find((item) => item.signalType === 'REFERENCE_PATTERN')?.status).toBe('confirmed');
  });
});

describe('research orchestrator isolation', () => {
  it('does not throw into callers when adapter fails', async () => {
    const rows: unknown[] = [];
    const prisma = {
      researchRequest: {
        findUnique: async () => null,
        findFirst: async ({ where }: { where: { id?: string } }) =>
          rows.find((item) => (item as { id: string }).id === where.id) ?? rows[0] ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: 'req-1', requestedAt: new Date(), completedAt: null, seedUrls: [], seedKeywords: [], ...data, _count: { evidences: 0 } };
          rows.push(row);
          return row;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(rows[0] as object, data);
          return rows[0];
        },
      },
      researchEvidence: { create: async () => ({}) },
      project: {
        findFirst: async () => ({
          id: '33333333-3333-4333-8333-333333333333',
          tenantId: '11111111-1111-4111-8111-111111111111',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          platform: 'douyin',
        }),
      },
    };
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    const out = await service.requestResearch(
      { userId: 'u', tenantId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222', role: 'OWNER' },
      '33333333-3333-4333-8333-333333333333',
      {},
    );
    expect(out.statusLabel).toContain('尚未配置');
    const ctx = service.buildNormalizedContextForMi({
      userSources: [],
      researchRequested: true,
      systemEvidence: [],
    });
    expect(ctx.systemEvidenceSummaries).toEqual([]);
    expect(ctx.researchCoverage).toBeNull();
    expect(JSON.stringify(ctx)).not.toMatch(/抖音最近流行|竞品热视频平均/);
  });
});

describe('learning memory bridge', () => {
  it('places confirmed in patterns and candidate in candidateSignals', () => {
    const service = new LearningService({} as never, {} as never);
    const confirmed = buildLearningSignalsFromPerformanceFeedback(
      feedback({ positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['a', 'b'] })] }),
    );
    const candidate = buildLearningSignalsFromPerformanceFeedback(
      feedback({ sampleSize: 1, positiveSignals: [signal({ code: 'HIGH_SHARE_RATE', publicationIds: ['c'] })] }),
    );
    const bridged = service.memoryBridge([...confirmed, ...candidate]);
    expect(bridged.patterns[0]?.supportCount).toBeGreaterThanOrEqual(2);
    expect(bridged.candidateSignals[0]?.supportCount).toBe(1);
  });

  it('next batch context stays compact', () => {
    const confirmed = buildLearningSignalsFromPerformanceFeedback(
      feedback({ positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['a', 'b'] })] }),
    );
    const candidate = buildLearningSignalsFromPerformanceFeedback(
      feedback({ sampleSize: 1, positiveSignals: [signal({ code: 'HIGH_SHARE_RATE', publicationIds: ['c'] })] }),
    );
    const ctx = {
      confirmed: confirmed.map((item) => ({ key: item.key, supportCount: item.supportCount })),
      candidate: candidate.map((item) => ({ key: item.key, supportCount: item.supportCount })),
      latestRecommendations: recommendationsFromSignals(confirmed),
    };
    expect(JSON.stringify(ctx)).not.toMatch(/metricHistory|snapshots/);
    expect(ctx.confirmed[0]?.supportCount).toBe(2);
    expect(ctx.candidate[0]?.supportCount).toBe(1);
  });
});

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const WS = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const AUTH = { userId: 'u', tenantId: TENANT, workspaceId: WS, role: 'OWNER' as const };

function sampleEvidence(id: string): Parameters<MockMarketResearchAdapter['constructor']>[0][number] {
  return {
    sourceType: 'DOUYIN_VIDEO_URL',
    platform: 'douyin',
    origin: 'SYSTEM_DISCOVERED',
    externalId: id,
    canonicalUrl: `https://www.douyin.com/video/${id}`,
    title: id,
    capturedAt: '2026-09-01T00:00:00.000Z',
    confidence: 'LOW',
    provenance: 'SYSTEM_DISCOVERED',
    referenceOnly: true,
    displayAllowed: false,
    analysisAllowed: true,
    normalizedPayload: { id },
  };
}

function makeResearchPrisma() {
  const requests: Array<Record<string, unknown>> = [];
  const evidences: Array<Record<string, unknown>> = [];
  let creates = 0;
  const prisma = {
    researchRequest: {
      findUnique: async ({ where }: { where: { tenantId_projectId_queryHash?: { queryHash: string; tenantId: string } } }) => {
        const hash = where.tenantId_projectId_queryHash?.queryHash;
        const tenantId = where.tenantId_projectId_queryHash?.tenantId;
        return requests.find((row) => row.queryHash === hash && row.tenantId === tenantId) ?? null;
      },
      findFirst: async ({ where }: { where: { id?: string; tenantId?: string; projectId?: string } }) => {
        const row = requests.find(
          (item) =>
            (!where.id || item.id === where.id) &&
            (!where.tenantId || item.tenantId === where.tenantId) &&
            (!where.projectId || item.projectId === where.projectId),
        );
        if (!row) return null;
        return { ...row, _count: { evidences: evidences.filter((item) => item.researchRequestId === row.id).length } };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creates += 1;
        const row = {
          id: `req-${creates}`,
          requestedAt: new Date(),
          completedAt: null,
          seedUrls: [],
          seedKeywords: [],
          ...data,
        };
        requests.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id_tenantId?: { id: string } }; data: Record<string, unknown> }) => {
        const row = requests.find((item) => item.id === where.id_tenantId?.id) ?? requests[0];
        Object.assign(row as object, data);
        return row;
      },
    },
    researchEvidence: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (evidences.some((item) => item.tenantId === data.tenantId && item.contentHash === data.contentHash)) {
          throw { code: 'P2002' };
        }
        evidences.push(data);
        return data;
      },
    },
    project: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        if (where.tenantId !== TENANT || where.id !== PROJECT) return null;
        return { id: PROJECT, tenantId: TENANT, workspaceId: WS, platform: 'douyin', deletedAt: null };
      },
    },
    campaignStrategy: {
      findFirst: async () => ({ id: 'st-1', version: 3, payload: { frozen: true } }),
      update: async () => {
        throw new Error('must not mutate strategy');
      },
    },
    strategyAdjustmentRecommendation: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      update: async () => ({}),
    },
    publication: { findMany: async () => [] },
    video: { findMany: async () => [] },
    script: { findMany: async () => [] },
    contentPlan: { findFirst: async () => null },
    _creates: () => creates,
    _evidences: () => evidences,
    _requests: () => requests,
  };
  return prisma;
}

describe('research orchestrator contracts', () => {
  it('does not create a second request for the same query hash', async () => {
    const prisma = makeResearchPrisma();
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['a'] });
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['a'] });
    expect(prisma._creates()).toBe(1);
  });

  it('creates a new request on explicit refresh', async () => {
    const prisma = makeResearchPrisma();
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['a'] });
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['a'], refresh: true });
    expect(prisma._creates()).toBe(2);
  });

  it('keeps 2 evidences and PARTIAL when one of three sources fails', async () => {
    const prisma = makeResearchPrisma();
    const adapter = new MockMarketResearchAdapter(
      [sampleEvidence('1'), sampleEvidence('2')],
      [{ source: '3', reason: 'timeout' }],
    );
    const service = new AutonomousResearchService(prisma as never, { resolve: () => adapter } as never, new DisabledMarketResearchAdapter());
    const out = await service.requestResearch(AUTH, PROJECT, {}, undefined, adapter);
    expect(out.statusLabel).toBe('部分完成');
    expect(prisma._evidences()).toHaveLength(2);
    expect(out.evidenceCount).toBe(2);
  });

  it('dedupes the same evidence hash', async () => {
    const prisma = makeResearchPrisma();
    const adapter = new MockMarketResearchAdapter([sampleEvidence('1'), sampleEvidence('1')]);
    const service = new AutonomousResearchService(prisma as never, { resolve: () => adapter } as never, new DisabledMarketResearchAdapter());
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['dup'] }, undefined, adapter);
    expect(prisma._evidences()).toHaveLength(1);
  });

  it('never persists own-account metrics as market evidence', async () => {
    const prisma = makeResearchPrisma();
    const adapter = new MockMarketResearchAdapter([
      { ...sampleEvidence('own'), sourceType: 'OWN_ACCOUNT_METRIC', origin: 'USER_PROVIDED' },
    ]);
    const service = new AutonomousResearchService(prisma as never, { resolve: () => adapter } as never, new DisabledMarketResearchAdapter());
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['own'] }, undefined, adapter);
    expect(prisma._evidences()).toHaveLength(0);
  });

  it('isolates research rows by tenant', async () => {
    const prisma = makeResearchPrisma();
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    const created = await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['iso'] });
    await expect(
      service.getById({ ...AUTH, tenantId: OTHER_TENANT }, PROJECT, created.id),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('public research view omits raw adapter payload', async () => {
    const prisma = makeResearchPrisma();
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    const view = await service.requestResearch(AUTH, PROJECT, {});
    expect(view).not.toHaveProperty('rawPayload');
    expect(view).not.toHaveProperty('adapter');
    expect(JSON.stringify(view)).not.toMatch(/cookie|apiKey|secret/i);
    expect(view.limitationSummary).toContain('尚未配置');
    expect(view.evidenceCount).toBe(0);
  });

  it('records empty usageEventIds and never marks disabled research completed', async () => {
    const prisma = makeResearchPrisma();
    const service = new AutonomousResearchService(prisma as never, { resolve: () => new DisabledMarketResearchAdapter() } as never, new DisabledMarketResearchAdapter());
    await service.requestResearch(AUTH, PROJECT, { seedKeywords: ['meter'] });
    expect((prisma._requests()[0]?.status as string)).toBe('NOT_CONFIGURED');
    expect((prisma._requests()[0]?.resultSummary as { evidenceCount?: number }).evidenceCount).toBe(0);
    expect((prisma._requests()[0]?.usageSummary as { usageEventIds?: string[] }).usageEventIds).toEqual([]);
  });
});

describe('learning strategy safety', () => {
  it('does not overwrite campaign strategy when summarizing learning', async () => {
    const prisma = makeResearchPrisma();
    const service = new LearningService(prisma as never, {
      buildForProject: async () =>
        feedback({
          positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['a', 'b'] })],
        }),
    } as never);
    const view = await service.summarize(AUTH, PROJECT);
    expect(view.statusLabel).toContain('多次数据支持');
    expect(JSON.stringify(view)).not.toMatch(/supportCount=|TOPIC_POSITIVE/);
  });

  it('surfaces n=1 candidate signals and TEST_MORE without requiring conversion metrics', async () => {
    const prisma = makeResearchPrisma();
    const service = new LearningService(prisma as never, {
      buildForProject: async () =>
        feedback({
          sampleSize: 1,
          publicationsConsidered: 1,
          dataState: 'LIMITED',
          positiveSignals: [signal({ code: 'HIGH_LIKE_RATE', publicationIds: ['pub-1'] })],
        }),
    } as never);
    const view = await service.summarize(AUTH, PROJECT);
    expect(view.statusLabel).toBe('出现初步迹象，系统会继续观察。');
    expect(view.summary.length).toBeGreaterThan(0);
    expect(view.nextBatchAdjustments.length).toBeGreaterThan(0);
    expect(view.nextBatchAdjustments.some((item) => item.includes('再试') || item.includes('保持'))).toBe(true);
  });
});

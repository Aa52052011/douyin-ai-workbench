import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  computeSourceWatermark,
  detectRecentContentOverlap,
  DeterministicMemoryRetriever,
  normalizeMemoryText,
  patternKey,
  splitPatterns,
  upsertPattern,
  type PatternAccumulator,
} from './account-memory.helpers.js';
import { PATTERN_CONFIRMED_MIN_SUPPORT } from './account-memory.types.js';
import { AccountMemoryService } from './account-memory.service.js';

describe('account-memory helpers', () => {
  it('normalizes and builds stable pattern keys', () => {
    assert.equal(normalizeMemoryText('  Hook！提问 '), 'hook提问');
    assert.equal(patternKey('HOOK', '提问式开头'), patternKey('HOOK', '  提问式开头  '));
  });

  it('aggregates patterns and enforces supportCount >= 2 for winning/losing', () => {
    const map = new Map<string, PatternAccumulator>();
    upsertPattern(map, {
      patternType: 'PERFORMANCE_SIGNAL',
      rawKey: 'HIGH_LIKE_RATE',
      summary: '正向',
      supportCount: 1,
      lastObservedAt: '2026-01-01T00:00:00.000Z',
      direction: 'POSITIVE',
    });
    let split = splitPatterns(map);
    assert.equal(split.winningPatterns.length, 0);
    assert.equal(split.candidateSignals.length, 1);
    assert.equal(split.candidateSignals[0]?.supportCount, 1);

    upsertPattern(map, {
      patternType: 'PERFORMANCE_SIGNAL',
      rawKey: 'HIGH_LIKE_RATE',
      summary: '正向再次',
      supportCount: 1,
      lastObservedAt: '2026-01-02T00:00:00.000Z',
      direction: 'POSITIVE',
    });
    split = splitPatterns(map);
    assert.equal(split.winningPatterns.length, 1);
    assert.ok(split.winningPatterns[0]!.supportCount >= PATTERN_CONFIRMED_MIN_SUPPORT);
    assert.equal(split.candidateSignals.length, 0);
  });

  it('keeps negative single-support as candidate only', () => {
    const map = new Map<string, PatternAccumulator>();
    upsertPattern(map, {
      patternType: 'PERFORMANCE_SIGNAL',
      rawKey: 'LOW_ENGAGEMENT_RATE',
      summary: '负向一次',
      supportCount: 1,
      lastObservedAt: '2026-01-01T00:00:00.000Z',
      direction: 'NEGATIVE',
    });
    const split = splitPatterns(map);
    assert.equal(split.losingPatterns.length, 0);
    assert.equal(split.candidateSignals.length, 1);
  });

  it('detects content overlap deterministically', () => {
    const hit = detectRecentContentOverlap({
      recentTitles: ['美甲获客攻略'],
      recentHooks: ['你还在为没客源发愁吗'],
      recentAngles: ['到店转化'],
      publishedTopicIds: ['topic-1'],
      candidate: {
        title: '美甲获客攻略',
        hook: '你还在为没客源发愁吗',
        angle: '到店转化',
        topicId: 'topic-1',
      },
    });
    assert.equal(hit.sameTitle, true);
    assert.equal(hit.sameHook, true);
    assert.equal(hit.sameAngle, true);
    assert.equal(hit.sameTopicId, true);
    assert.ok(hit.warnings.length >= 3);

    const miss = detectRecentContentOverlap({
      recentTitles: ['其它标题'],
      recentHooks: ['其它 hook'],
      recentAngles: ['其它角度'],
      publishedTopicIds: ['topic-9'],
      candidate: {
        title: '全新主题',
        hook: '全新开场',
        angle: '全新角度',
        topicId: 'topic-2',
      },
    });
    assert.equal(miss.warnings.length, 0);
  });

  it('computes stable watermarks independent of call order when parts equal', () => {
    const a = computeSourceWatermark(['b1', 's1', 2]);
    const b = computeSourceWatermark(['b1', 's1', 2]);
    assert.equal(a, b);
    assert.notEqual(a, computeSourceWatermark(['b1', 's2', 2]));
  });

  it('retriever filters by pillar/angle fields', () => {
    const retriever = new DeterministicMemoryRetriever();
    const result = retriever.relevantFor({
      memory: {
        contentHistory: {
          recentTopics: ['A'],
          recentHooks: ['提问获客'],
          recentAngles: ['到店'],
          recentCtas: ['私信咨询'],
          recentContentPillars: ['获客'],
        },
        patterns: {
          winningPatterns: [
            {
              patternType: 'PERFORMANCE_SIGNAL',
              key: 'PERFORMANCE_SIGNAL:high_like_rate',
              summary: '高点赞',
              supportCount: 2,
              confidence: 'MEDIUM',
              lastObservedAt: '2026-01-01T00:00:00.000Z',
              direction: 'POSITIVE',
            },
          ],
          losingPatterns: [],
        },
      },
      current: { contentPillar: '获客', contentAngle: '到店', hook: '提问获客' },
    });
    assert.ok(result.matchingHooks.includes('提问获客'));
    assert.ok(result.matchingAngles.includes('到店'));
    assert.ok(result.matchingPillars.includes('获客'));
  });
});

describe('account-memory context view', () => {
  it('builds bounded context without raw storage keys', () => {
    const service = Object.create(AccountMemoryService.prototype) as AccountMemoryService;
    (service as unknown as { retriever: DeterministicMemoryRetriever }).retriever =
      new DeterministicMemoryRetriever();
    const ctx = service.toContextView(
      {
        core: {
          businessGoal: '到店咨询',
          goalCode: 'STORE_VISIT',
          positioningSummary: '本地美甲获客账号',
          currentStrategySummary: '短视频种草到店',
          contentDirection: ['到店转化'],
        },
        contentHistory: {
          recentTopics: ['主题1', '主题2'],
          recentTitles: ['标题1'],
          recentHooks: ['HookA', 'HookA', 'HookB'],
          recentAngles: ['角度A'],
          recentCtas: ['私信'],
          recentContentPillars: ['获客'],
          recentBatchSummaries: [{ planId: 'p1', title: '本批', batchSize: 7 }],
          publishedTopicIds: ['t1'],
          confirmedScriptIds: ['s1'],
        },
        performance: {
          dataState: 'LIMITED',
          sampleSize: 2,
          recentPerformanceSignals: [
            { code: 'HIGH_LIKE_RATE', category: 'ENGAGEMENT', supportCount: 2, confidence: 'MEDIUM', direction: 'POSITIVE' },
          ],
          winningSignals: [{ code: 'HIGH_LIKE_RATE', supportCount: 2, confidence: 'MEDIUM' }],
          weakSignals: [],
          supportCountFloor: 2,
        },
        production: {
          recentProductionModes: [],
          recentAssetTypes: [],
          recentVideoDurations: [30],
          reusedAssetIds: [],
        },
        patterns: {
          winningPatterns: [
            {
              patternType: 'PERFORMANCE_SIGNAL',
              key: 'PERFORMANCE_SIGNAL:high_like_rate',
              summary: '高点赞',
              supportCount: 2,
              confidence: 'MEDIUM',
              lastObservedAt: '2026-01-02T00:00:00.000Z',
              direction: 'POSITIVE',
            },
          ],
          losingPatterns: [],
          candidateSignals: [
            {
              patternType: 'HOOK',
              key: 'HOOK:once',
              summary: '单次 hook',
              supportCount: 1,
              lastObservedAt: '2026-01-01T00:00:00.000Z',
              direction: 'NEUTRAL',
            },
          ],
        },
        recent: {
          unfinishedTopicIds: [],
          currentBatchId: 'p1',
        },
        meta: {
          memoryVersion: 'v1',
          builtAt: '2026-01-03T00:00:00.000Z',
          sourceCounts: { scripts: 2 },
          watermark: 'abc',
        },
      },
      { topicTitle: '主题1', hook: 'HookA', topicId: 't1' },
    );

    assert.equal(ctx.primaryGoal, '到店咨询');
    assert.ok(ctx.recentHooks.includes('HookA'));
    assert.equal(ctx.winningPatterns[0]?.supportCount, 2);
    assert.ok(ctx.overlapWarnings.length >= 1);
    assert.equal(JSON.stringify(ctx).includes('storageKey'), false);
    assert.equal(JSON.stringify(ctx).includes('REFERENCE_CONTENT'), false);
  });
});

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FrameSamplerService } from '../frame/frame-sampler.service.js';
import { buildB11Facts, buildMediaMetadata, DeterministicMetadataAnalyzer } from '../deterministic-metadata-analyzer.js';
import { FRAME_ANALYSIS_ERROR } from '../frame/frame-analysis-errors.js';
import { DETERMINISTIC_MEDIA_ERROR } from '../parse-analyzer-ffprobe.js';
import type { FrameAnalysisAttach } from '../frame/sample-and-stat.js';
import { CROP_GEOMETRY_SCORING_VERSION } from '../crop/crop-config.js';
import { LocalJsonVisualAnalysisCacheStore } from '../cache/local-json-visual-analysis-cache-store.js';
import { DeterministicVisualAnalyzerService } from './deterministic-visual-analyzer.service.js';

const metadata = buildMediaMetadata({ width: 1920, height: 1040, durationMs: 2000, hasAudio: false, mimeType: 'video/mp4' })!;

function attach(overrides: Partial<FrameAnalysisAttach> = {}): FrameAnalysisAttach {
  return {
    samplingPlan: {
      strategy: 'UNIFORM_V1',
      requestedTimestampsMs: [0],
      maxFrames: 1,
      sourceDurationMs: 2000,
      dedupeEnabled: true,
      configVersion: 'uniform-v1',
    },
    frameSamplesSummary: [{ sampleId: 's0', timestampMs: 0, source: 'START', extractionOk: true, isNearDuplicate: false }],
    frameDifferences: [],
    frameStatsAggregate: {
      sampleCountRequested: 1,
      sampleCountExtracted: 1,
      sampleCountUsable: 1,
      nearDuplicateCount: 0,
      luma: { min: 1, median: 1, max: 1 },
      contrastProxy: { min: 0, median: 0, max: 0 },
      sharpnessProxy: { min: 0, median: 0, max: 0 },
      frameChange: { min: 0, median: 0, max: 0 },
      nearDuplicatePairRatio: 0,
    },
    regionHeuristics: { borderCandidates: [], emptyRegionCandidates: [], topStructuredStripCandidates: [], warnings: [] },
    motionHeuristics: {
      nearStaticPairs: [],
      nearStaticRanges: [],
      longStaticCandidates: [],
      highChangePairs: [],
      rapidChangeCandidates: [],
      sceneChangeCandidates: [],
      temporalActivitySegments: [],
      warnings: [],
      skipped: 'INSUFFICIENT_SAMPLES',
    },
    cropGeometry: {
      candidates: [],
      ranking: {
        kind: 'DETERMINISTIC_GEOMETRY_RANK',
        cropScoringVersion: CROP_GEOMETRY_SCORING_VERSION,
        rankedCandidateIds: [],
        closePairIds: [],
        note: 'NOT_FINAL_DIRECTOR_SELECTION',
      },
      cropScoringVersion: CROP_GEOMETRY_SCORING_VERSION,
      warnings: [],
    },
    cropComputeMs: 1,
    motionComputeMs: 1,
    ...overrides,
  };
}

class CountingMeta extends DeterministicMetadataAnalyzer {
  probeCalls = 0;
  constructor(private readonly failTimes = 0) {
    super();
  }
  override async analyzeFile() {
    this.probeCalls += 1;
    if (this.probeCalls <= this.failTimes) {
      return { ok: false as const, code: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED };
    }
    return {
      ok: true as const,
      facts: buildB11Facts({ assetId: 'x', contentHash: 'hash-1', metadata }),
    };
  }
}

describe('DeterministicVisualAnalyzerService', () => {
  let dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs = [];
  });

  function store() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'acf-dva-an-'));
    dirs.push(dir);
    return new LocalJsonVisualAnalysisCacheStore(dir);
  }

  it('HIT skips probe and sampling', async () => {
    const meta = new CountingMeta();
    let samples = 0;
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: meta,
      cache: store(),
      sampleAndStat: async () => {
        samples += 1;
        return { ok: true, attach: attach(), warnings: [] };
      },
    });
    const first = await analyzer.analyze({
      assetId: 'asset-a',
      contentHash: 'hash-1',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(first.cacheStatus).toBe('MISS');
    expect(first.cacheWriteStatus).toBe('WRITTEN');
    expect(meta.probeCalls).toBe(1);
    expect(samples).toBe(1);
    const second = await analyzer.analyze({
      assetId: 'asset-b',
      contentHash: 'hash-1',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(second.cacheStatus).toBe('HIT');
    expect(meta.probeCalls).toBe(1);
    expect(samples).toBe(1);
    expect(second.facts?.assetId).toBe('asset-b');
    expect(second.deterministicStatus).toBe('READY');
    expect(second.facts?.status).toBe('PARTIAL');
  });

  it('probe failure is FAILED and does not sample', async () => {
    const meta = new CountingMeta(9);
    let samples = 0;
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: meta,
      cache: store(),
      sampleAndStat: async () => {
        samples += 1;
        return { ok: true, attach: attach(), warnings: [] };
      },
    });
    const result = await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(result.deterministicStatus).toBe('FAILED');
    expect(result.errorCode).toBe(DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED);
    expect(result.facts).toBeUndefined();
    expect(samples).toBe(0);
    expect(meta.probeCalls).toBe(2);
  });

  it('frame failure keeps metadata as PARTIAL', async () => {
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: new CountingMeta(),
      cache: store(),
      sampleAndStat: async () => ({
        ok: false,
        code: FRAME_ANALYSIS_ERROR.NO_USABLE_FRAME_SAMPLE,
        warnings: ['FRAME_EXTRACTION_FAILED'],
      }),
    });
    const result = await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(result.deterministicStatus).toBe('PARTIAL');
    expect(result.facts?.completedStages).toEqual(['METADATA', 'GEOMETRY']);
    expect(result.facts?.motionSummary).toBeUndefined();
    expect(result.cacheWriteStatus).toBe('SKIPPED');
  });

  it('crop stage failure keeps earlier facts', async () => {
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: new CountingMeta(),
      cache: store(),
      sampleAndStat: async () => ({
        ok: true,
        attach: attach({ cropGeometry: undefined }),
        warnings: ['CROP_CANDIDATE_STAGE_FAILED'],
      }),
    });
    const result = await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(result.deterministicStatus).toBe('PARTIAL');
    expect(result.facts?.frameStatsAggregate).toBeTruthy();
    expect(result.facts?.cropGeometryCandidates).toBeUndefined();
    expect(result.warnings).toContain('CROP_CANDIDATE_STAGE_FAILED');
  });

  it('cache write failure still returns analysis', async () => {
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: new CountingMeta(),
      cache: {
        get: async () => ({ status: 'MISS' as const }),
        set: async () => {
          throw new Error('EACCES');
        },
      },
      sampleAndStat: async () => ({ ok: true, attach: attach(), warnings: [] }),
    });
    const result = await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
    });
    expect(result.deterministicStatus).toBe('READY');
    expect(result.cacheWriteStatus).toBe('FAILED');
    expect(result.warnings).toContain('CACHE_WRITE_FAILED');
    expect(result.facts).toBeTruthy();
  });

  it('overall timeout skips sampling', async () => {
    let calls = 0;
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: new CountingMeta(),
      cache: store(),
      now: () => {
        calls += 1;
        return calls === 1 ? 0 : 10_000;
      },
      sampleAndStat: async () => {
        throw new Error('should not sample');
      },
    });
    const result = await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
      overallTimeoutMs: 10,
    });
    expect(result.deterministicStatus).toBe('PARTIAL');
    expect(result.warnings).toContain('ANALYSIS_OVERALL_TIMEOUT');
    expect(result.facts?.completedStages).toEqual(['METADATA', 'GEOMETRY']);
  });

  it('forceReanalyze bypasses cache', async () => {
    const meta = new CountingMeta();
    let samples = 0;
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: meta,
      cache: store(),
      sampleAndStat: async () => {
        samples += 1;
        return { ok: true, attach: attach(), warnings: [] };
      },
    });
    await analyzer.analyze({ assetId: 'a', contentHash: 'h', mediaPath: 'logical://v', kind: 'VIDEO' });
    await analyzer.analyze({
      assetId: 'a',
      contentHash: 'h',
      mediaPath: 'logical://v',
      kind: 'VIDEO',
      forceReanalyze: true,
    });
    expect(meta.probeCalls).toBe(2);
    expect(samples).toBe(2);
  });

  it('missing contentHash analyzes with NO_CACHE', async () => {
    const analyzer = new DeterministicVisualAnalyzerService({
      metadata: new CountingMeta(),
      cache: store(),
      sampleAndStat: async () => ({ ok: true, attach: attach(), warnings: [] }),
    });
    const result = await analyzer.analyze({ assetId: 'a', mediaPath: 'logical://v', kind: 'VIDEO' });
    expect(result.warnings).toContain('NO_CACHE');
    expect(result.cacheWriteStatus).toBe('SKIPPED');
    expect(result.deterministicStatus).toBe('READY');
  });
});

describe('temp cleanup', () => {
  it('removes acf-dva temp dir when extract throws', async () => {
    const sampler = new FrameSamplerService(async () => {
      throw new Error('PROCESS_TIMEOUT');
    });
    let dir = '';
    await expect(
      sampler.withTempDir(async (work) => {
        dir = work;
        await sampler.extractLumaFrame({
          filePath: 'logical://v',
          timestampMs: 0,
          sourceWidth: 16,
          sourceHeight: 16,
          workDir: work,
          sampleId: 's0',
        });
      }),
    ).rejects.toThrow();
    expect(dir).toMatch(/acf-dva-/);
    expect(existsSync(dir)).toBe(false);
  });
});

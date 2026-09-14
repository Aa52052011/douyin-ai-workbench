import { describe, expect, it } from 'vitest';
import { buildMediaMetadata } from '../deterministic-metadata-analyzer.js';
import { FRAME_ANALYSIS_ERROR } from './frame-analysis-errors.js';
import { FrameSamplerService } from './frame-sampler.service.js';
import { sampleAndStatFrames } from './sample-and-stat.js';
import type { LumaFrame } from './luma-stats.js';

class StubSampler extends FrameSamplerService {
  constructor(private readonly frames: Map<string, LumaFrame | 'fail'>) {
    super();
  }

  override async withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    return fn('logical-work');
  }

  override async extractLumaFrame(input: { sampleId: string }): Promise<LumaFrame> {
    const row = this.frames.get(input.sampleId);
    if (!row || row === 'fail') {
      throw new Error('FRAME_DECODE_FAILED');
    }
    return row;
  }
}

const meta = buildMediaMetadata({
  width: 1920,
  height: 1040,
  durationMs: 2000,
  hasAudio: false,
  mimeType: 'video/mp4',
})!;

describe('sampleAndStatFrames', () => {
  it('skips video without duration', async () => {
    const noDur = buildMediaMetadata({ width: 100, height: 100, hasAudio: false, mimeType: 'video/mp4' })!;
    const result = await sampleAndStatFrames({ metadata: noDur, filePath: 'logical://x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toBe(true);
      expect(result.warnings).toContain(FRAME_ANALYSIS_ERROR.FRAME_SAMPLING_SKIPPED_DURATION_UNKNOWN);
    }
  });

  it('keeps partial success and fails only when none extract', async () => {
    const gray = { width: 4, height: 4, pixels: Buffer.alloc(16, 80) };
    const mixed = new StubSampler(new Map([['s0', gray], ['s1', 'fail'], ['s2', gray], ['s3', gray], ['s4', gray]]));
    const partial = await sampleAndStatFrames({ metadata: meta, filePath: 'logical://x', sampler: mixed });
    expect(partial.ok).toBe(true);
    if (partial.ok && !partial.skipped) {
      expect(partial.warnings).toContain('FRAME_SAMPLE_PARTIAL');
      expect(partial.attach.frameStatsAggregate.sampleCountExtracted).toBe(4);
      expect(partial.attach.frameStatsAggregate.sampleCountRequested).toBe(5);
    }
    const none = new StubSampler(new Map());
    const failed = await sampleAndStatFrames({ metadata: meta, filePath: 'logical://x', sampler: none });
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.code).toBe(FRAME_ANALYSIS_ERROR.NO_USABLE_FRAME_SAMPLE);
    }
  });

  it('skips motion on images and classifies identical video samples', async () => {
    const gray = { width: 8, height: 8, pixels: Buffer.alloc(64, 90) };
    const imgMeta = buildMediaMetadata({ width: 8, height: 8, hasAudio: false, mimeType: 'image/png' })!;
    const image = await sampleAndStatFrames({
      metadata: imgMeta,
      filePath: 'logical://img',
      sampler: new StubSampler(new Map([['s0', gray]])),
    });
    expect(image.ok && !image.skipped).toBe(true);
    if (image.ok && !image.skipped) {
      expect(image.attach.motionHeuristics?.skipped).toBe('IMAGE');
      expect(image.attach.motionHeuristics?.motionSummary).toBeUndefined();
    }

    const longMeta = buildMediaMetadata({
      width: 8,
      height: 8,
      durationMs: 35_000,
      hasAudio: false,
      mimeType: 'video/mp4',
    })!;
    const frames = new Map<string, LumaFrame | 'fail'>(
      Array.from({ length: 8 }, (_, i) => [`s${i}`, gray] as const),
    );
    const video = await sampleAndStatFrames({
      metadata: longMeta,
      filePath: 'logical://v',
      sampler: new StubSampler(frames),
    });
    expect(video.ok && !video.skipped).toBe(true);
    if (video.ok && !video.skipped) {
      expect(video.attach.motionHeuristics?.motionSummary?.activityLevel).toBe('STATIC');
      expect(video.attach.motionHeuristics?.motionSummary?.confidence).toBeLessThan(0.95);
    }
  });

  it('keeps prior facts when crop scoring throws', async () => {
    const gray = { width: 8, height: 8, pixels: Buffer.alloc(64, 90) };
    const longMeta = buildMediaMetadata({
      width: 8,
      height: 8,
      durationMs: 35_000,
      hasAudio: false,
      mimeType: 'video/mp4',
    })!;
    const frames = new Map<string, LumaFrame | 'fail'>(
      Array.from({ length: 8 }, (_, i) => [`s${i}`, gray] as const),
    );
    const result = await sampleAndStatFrames({
      metadata: longMeta,
      filePath: 'logical://v',
      sampler: new StubSampler(frames),
      cropGenerator: () => {
        throw new Error('crop boom');
      },
    });
    expect(result.ok && !result.skipped).toBe(true);
    if (result.ok && !result.skipped) {
      expect(result.warnings).toContain('CROP_CANDIDATE_STAGE_FAILED');
      expect(result.attach.cropGeometry).toBeUndefined();
      expect(result.attach.regionHeuristics?.borderCandidates).toBeDefined();
      expect(result.attach.motionHeuristics?.motionSummary).toBeTruthy();
    }
  });

  it('keeps frame stats when region or motion heuristics throw', async () => {
    const gray = { width: 8, height: 8, pixels: Buffer.alloc(64, 90) };
    const longMeta = buildMediaMetadata({
      width: 8,
      height: 8,
      durationMs: 35_000,
      hasAudio: false,
      mimeType: 'video/mp4',
    })!;
    const frames = new Map<string, LumaFrame | 'fail'>(
      Array.from({ length: 8 }, (_, i) => [`s${i}`, gray] as const),
    );
    const regionFail = await sampleAndStatFrames({
      metadata: longMeta,
      filePath: 'logical://v',
      sampler: new StubSampler(frames),
      regionDetector: () => {
        throw new Error('region boom');
      },
    });
    expect(regionFail.ok && !regionFail.skipped).toBe(true);
    if (regionFail.ok && !regionFail.skipped) {
      expect(regionFail.warnings).toContain('REGION_HEURISTIC_STAGE_FAILED');
      expect(regionFail.attach.frameDifferences.length).toBeGreaterThan(0);
      expect(regionFail.attach.cropGeometry).toBeTruthy();
    }
    const motionFail = await sampleAndStatFrames({
      metadata: longMeta,
      filePath: 'logical://v',
      sampler: new StubSampler(frames),
      motionAnalyzer: () => {
        throw new Error('motion boom');
      },
    });
    expect(motionFail.ok && !motionFail.skipped).toBe(true);
    if (motionFail.ok && !motionFail.skipped) {
      expect(motionFail.warnings).toContain('MOTION_HEURISTIC_STAGE_FAILED');
      expect(motionFail.attach.motionHeuristics?.motionSummary).toBeUndefined();
      expect(motionFail.attach.cropGeometry).toBeTruthy();
    }
  });
});

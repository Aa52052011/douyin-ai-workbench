import { FRAME_ANALYSIS_CONFIG, FRAME_SAMPLING_CONFIG_VERSION, effectiveSampleCount, requestedSampleCount } from './frame-analysis-config.js';
import { aggregateFrameStats, heuristicFrameWarnings, markNearDuplicates } from './frame-aggregate.js';
import type { FrameDifference, FrameSample, SamplingPlan } from './frame-sample.types.js';
import { FrameSamplerService } from './frame-sampler.service.js';
import { computeLumaStatistics, computeSharpnessProxy, lumaSimilarity, meanAbsoluteLumaDelta, type LumaFrame } from './luma-stats.js';
import { buildUniformSampleTimestamps, sampleSourceAtIndex } from './sample-timestamps.js';
import type { DeterministicMediaMetadata, DeterministicVisualFacts } from '../deterministic-visual.types.js';
import { detectFrameRegionHeuristics } from '../region/detect-frame-regions.js';
import { aggregateRegionHeuristics } from '../region/aggregate-region-heuristics.js';
import type { AggregatedRegionHeuristics } from '../region/region-heuristic.types.js';
import { FRAME_ANALYSIS_ERROR, type FrameAnalysisErrorCode } from './frame-analysis-errors.js';
import { analyzeMotionHeuristics, histogramL1Normalized } from '../motion/analyze-motion.js';
import type { MotionHeuristicsResult } from '../motion/motion.types.js';
import { generateCropGeometryCandidates } from '../crop/build-crop-candidates.js';
import type { CropGeometryResult } from '../crop/crop.types.js';

export type FrameAnalysisAttach = {
  samplingPlan: SamplingPlan;
  frameSamplesSummary: ReturnType<typeof summarizeSamples>;
  frameDifferences: FrameDifference[];
  frameStatsAggregate: ReturnType<typeof aggregateFrameStats>;
  regionHeuristics?: AggregatedRegionHeuristics;
  motionHeuristics?: MotionHeuristicsResult;
  motionComputeMs?: number;
  cropGeometry?: CropGeometryResult;
  cropComputeMs?: number;
};

function summarizeSamples(samples: FrameSample[]) {
  return samples.map((item) => ({
    sampleId: item.sampleId,
    timestampMs: item.timestampMs,
    source: item.source,
    extractionOk: item.extractionOk,
    isNearDuplicate: item.isNearDuplicate,
    duplicateOfSampleId: item.duplicateOfSampleId,
    similarityScore: item.similarityScore,
    averageLuma: item.statistics?.averageLuma,
    lumaStdDev: item.statistics?.lumaStdDev,
    sharpnessProxy: item.statistics?.sharpnessProxy,
  }));
}

function isImageMime(mimeType: string | undefined): boolean {
  return Boolean(mimeType?.startsWith('image/'));
}

export function buildSamplingPlan(metadata: DeterministicMediaMetadata): SamplingPlan | { skip: true; warning: string } {
  if (isImageMime(metadata.mimeType)) {
    return {
      strategy: 'UNIFORM_V1',
      requestedTimestampsMs: [0],
      maxFrames: 1,
      sourceDurationMs: metadata.durationMs,
      dedupeEnabled: true,
      configVersion: FRAME_SAMPLING_CONFIG_VERSION,
    };
  }
  if (metadata.durationMs == null || metadata.durationMs <= 0) {
    return { skip: true, warning: FRAME_ANALYSIS_ERROR.FRAME_SAMPLING_SKIPPED_DURATION_UNKNOWN };
  }
  const count = effectiveSampleCount(metadata.durationMs, requestedSampleCount(metadata.durationMs));
  const stamps = buildUniformSampleTimestamps(metadata.durationMs, count);
  return {
    strategy: 'UNIFORM_V1',
    requestedTimestampsMs: stamps,
    maxFrames: FRAME_ANALYSIS_CONFIG.maxFrames,
    sourceDurationMs: metadata.durationMs,
    dedupeEnabled: true,
    configVersion: FRAME_SAMPLING_CONFIG_VERSION,
  };
}

function statsFromLuma(frame: LumaFrame) {
  const luma = computeLumaStatistics(frame, FRAME_ANALYSIS_CONFIG.darkLumaMax, FRAME_ANALYSIS_CONFIG.brightLumaMin);
  return {
    ...luma,
    sharpnessProxy: computeSharpnessProxy(frame),
    analysisWidth: frame.width,
    analysisHeight: frame.height,
  };
}

export async function sampleAndStatFrames(input: {
  metadata: DeterministicMediaMetadata;
  filePath: string;
  sampler?: FrameSamplerService;
  cropGenerator?: typeof generateCropGeometryCandidates;
  regionDetector?: typeof detectFrameRegionHeuristics;
  motionAnalyzer?: typeof analyzeMotionHeuristics;
}): Promise<
  | { ok: true; skipped?: false; attach: FrameAnalysisAttach; warnings: string[] }
  | { ok: true; skipped: true; warnings: string[] }
  | { ok: false; code: FrameAnalysisErrorCode; warnings: string[] }
> {
  const sampler = input.sampler ?? new FrameSamplerService();
  const planOrSkip = buildSamplingPlan(input.metadata);
  if ('skip' in planOrSkip) {
    return { ok: true, skipped: true, warnings: [planOrSkip.warning] };
  }
  const plan = planOrSkip;
  const stamps = plan.requestedTimestampsMs;
  const samples: FrameSample[] = [];
  const lumas: Array<LumaFrame | undefined> = [];

  await sampler.withTempDir(async (workDir) => {
    for (const [index, timestampMs] of stamps.entries()) {
      const sampleId = `s${index}`;
      const source = sampleSourceAtIndex(index, stamps.length);
      try {
        const luma = await sampler.extractLumaFrame({
          filePath: input.filePath,
          timestampMs,
          sourceWidth: input.metadata.width,
          sourceHeight: input.metadata.height,
          workDir,
          sampleId,
        });
        lumas[index] = luma;
        samples.push({
          sampleId,
          timestampMs,
          width: luma.width,
          height: luma.height,
          source,
          tempRef: `luma:${sampleId}`,
          statistics: statsFromLuma(luma),
          extractionOk: true,
          isNearDuplicate: false,
        });
      } catch {
        lumas[index] = undefined;
        samples.push({
          sampleId,
          timestampMs,
          width: 0,
          height: 0,
          source,
          extractionOk: false,
          isNearDuplicate: false,
        });
      }
    }
  });

  const extracted = samples.filter((item) => item.extractionOk);
  if (extracted.length === 0) {
    return { ok: false, code: FRAME_ANALYSIS_ERROR.NO_USABLE_FRAME_SAMPLE, warnings: ['FRAME_EXTRACTION_FAILED'] };
  }

  const diffs: FrameDifference[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = lumas[i - 1];
    const cur = lumas[i];
    const from = samples[i - 1];
    const to = samples[i];
    if (!prev || !cur || !from?.extractionOk || !to?.extractionOk) {
      continue;
    }
    const mae = meanAbsoluteLumaDelta(prev, cur);
    diffs.push({
      fromSampleId: from.sampleId,
      toSampleId: to.sampleId,
      delta: mae.delta,
      normalizedDelta: mae.normalizedDelta,
      histogramDistance: histogramL1Normalized(from.statistics?.lumaHistogram16, to.statistics?.lumaHistogram16),
    });
  }
  markNearDuplicates(samples, lumas, FRAME_ANALYSIS_CONFIG.similarityNearDuplicate, lumaSimilarity);
  const emptyRegions: AggregatedRegionHeuristics = {
    borderCandidates: [],
    emptyRegionCandidates: [],
    topStructuredStripCandidates: [],
    warnings: [],
  };
  const regionWarnings: string[] = [];
  let regionHeuristics: AggregatedRegionHeuristics = emptyRegions;
  try {
    const detect = input.regionDetector ?? detectFrameRegionHeuristics;
    const perFrame = samples.flatMap((sample, index) => {
      const luma = lumas[index];
      if (!sample.extractionOk || !luma) {
        return [];
      }
      return [detect(luma, sample.sampleId, sample.timestampMs)];
    });
    regionHeuristics = aggregateRegionHeuristics(perFrame, samples);
  } catch {
    regionHeuristics = emptyRegions;
    regionWarnings.push('REGION_HEURISTIC_STAGE_FAILED');
  }
  lumas.fill(undefined);
  const motionStarted = Date.now();
  const motionFn = input.motionAnalyzer ?? analyzeMotionHeuristics;
  let motionHeuristics: MotionHeuristicsResult;
  const motionWarnings: string[] = [];
  try {
    motionHeuristics = motionFn({
      samples,
      diffs,
      isImage: isImageMime(input.metadata.mimeType),
      requestedSampleCount: stamps.length,
    });
  } catch {
    motionHeuristics = {
      nearStaticPairs: [],
      nearStaticRanges: [],
      longStaticCandidates: [],
      highChangePairs: [],
      rapidChangeCandidates: [],
      sceneChangeCandidates: [],
      temporalActivitySegments: [],
      warnings: [],
      skipped: 'INSUFFICIENT_SAMPLES',
    };
    motionWarnings.push('MOTION_HEURISTIC_STAGE_FAILED');
  }
  const motionComputeMs = Date.now() - motionStarted;
  const cropStarted = Date.now();
  const cropFn = input.cropGenerator ?? generateCropGeometryCandidates;
  let cropGeometry: CropGeometryResult | undefined;
  const cropWarnings: string[] = [];
  try {
    cropGeometry = cropFn({
      metadata: input.metadata,
      borderCandidates: regionHeuristics.borderCandidates,
      emptyRegionCandidates: regionHeuristics.emptyRegionCandidates,
      topStructuredStripCandidates: regionHeuristics.topStructuredStripCandidates,
    });
    cropWarnings.push(...(cropGeometry.warnings ?? []));
  } catch {
    cropGeometry = undefined;
    cropWarnings.push('CROP_CANDIDATE_STAGE_FAILED');
  }
  const cropComputeMs = Date.now() - cropStarted;
  const aggregate = aggregateFrameStats(samples, diffs, stamps.length);
  const warnings = [
    ...heuristicFrameWarnings(aggregate, FRAME_ANALYSIS_CONFIG),
    ...regionHeuristics.warnings,
    ...regionWarnings,
    ...motionHeuristics.warnings,
    ...motionWarnings,
    ...cropWarnings,
  ];
  if (extracted.length < stamps.length) {
    warnings.push('FRAME_SAMPLE_PARTIAL');
  }
  return {
    ok: true,
    warnings,
    attach: {
      samplingPlan: plan,
      frameSamplesSummary: summarizeSamples(samples),
      frameDifferences: diffs,
      frameStatsAggregate: aggregate,
      regionHeuristics,
      motionHeuristics,
      motionComputeMs,
      cropGeometry,
      cropComputeMs,
    },
  };
}

export function mergeFrameAnalysis(
  facts: DeterministicVisualFacts,
  attach: FrameAnalysisAttach,
  extraWarnings: string[],
): DeterministicVisualFacts {
  const stages = new Set(facts.completedStages);
  stages.add('FRAME_SAMPLING');
  stages.add('FRAME_STATS');
  if (attach.regionHeuristics) {
    stages.add('BORDER_HEURISTICS');
    stages.add('EMPTY_REGION_HEURISTICS');
    stages.add('TOP_STRIP_HEURISTICS');
  }
  const motion = attach.motionHeuristics;
  const includeMotion = motion && motion.skipped !== 'IMAGE';
  if (includeMotion) {
    stages.add('MOTION_HEURISTICS');
    stages.add('SCENE_HEURISTICS');
  }
  if (attach.cropGeometry) {
    stages.add('CROP_GEOMETRY_CANDIDATES');
  }
  return {
    ...facts,
    warnings: [...facts.warnings, ...extraWarnings],
    status: 'PARTIAL',
    completedStages: [...stages],
    samplingPlan: attach.samplingPlan,
    frameSamplesSummary: attach.frameSamplesSummary,
    frameDifferences: attach.frameDifferences,
    frameStatsAggregate: attach.frameStatsAggregate,
    borderCandidates: attach.regionHeuristics?.borderCandidates,
    emptyRegionCandidates: attach.regionHeuristics?.emptyRegionCandidates,
    topStructuredStripCandidates: attach.regionHeuristics?.topStructuredStripCandidates,
    ...(includeMotion && motion.skipped !== 'INSUFFICIENT_SAMPLES'
      ? {
          motionSummary: motion.motionSummary,
          temporalActivitySegments: motion.temporalActivitySegments,
          nearStaticRanges: motion.nearStaticRanges,
          longStaticCandidates: motion.longStaticCandidates,
          rapidChangeCandidates: motion.rapidChangeCandidates,
          sceneChangeCandidates: motion.sceneChangeCandidates,
        }
      : {}),
    ...(attach.cropGeometry
      ? {
          cropGeometryCandidates: attach.cropGeometry.candidates,
          cropGeometryRanking: attach.cropGeometry.ranking,
          cropScoringVersion: attach.cropGeometry.cropScoringVersion,
        }
      : {}),
  };
}

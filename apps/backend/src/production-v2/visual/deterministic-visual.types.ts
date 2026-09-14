import type { AggregatedRegionHeuristics } from './region/region-heuristic.types.js';
import type { FrameDifference, FrameSamplesSummary, FrameStatsAggregate, SamplingPlan } from './frame/frame-sample.types.js';
import type { MediaOrientation } from './geometry/types.js';
import type { CropGeometryCandidate, CropGeometryRanking } from './crop/crop.types.js';
import type {
  LongStaticCandidate,
  MotionSummary,
  NearStaticRange,
  RapidChangeCandidate,
  SceneChangeCandidate,
  TemporalActivitySegment,
} from './motion/motion.types.js';

export const DETERMINISTIC_VISUAL_SCHEMA = 'deterministic.visual:v1';
export const DETERMINISTIC_ANALYZER_VERSION = 'deterministic.visual:v1';

export const VISUAL_ANALYSIS_STAGES = [
  'METADATA',
  'GEOMETRY',
  'FRAME_SAMPLING',
  'FRAME_STATS',
  'BORDER_HEURISTICS',
  'EMPTY_REGION_HEURISTICS',
  'TOP_STRIP_HEURISTICS',
  'MOTION_HEURISTICS',
  'SCENE_HEURISTICS',
  'MOTION',
  'SCENE',
  'CROP_GEOMETRY_CANDIDATES',
  'CROP_CANDIDATES',
] as const;

export type VisualAnalysisStage = (typeof VISUAL_ANALYSIS_STAGES)[number];

export type DeterministicAnalysisStatus = 'READY' | 'PARTIAL' | 'FAILED';

export type DeterministicMediaMetadata = {
  width: number;
  height: number;
  durationMs?: number;
  fps?: number;
  frameCount?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
  aspectRatio: string;
  orientation: MediaOrientation;
  fileSize?: number;
  mimeType?: string;
};

/**
 * B1.1 fills metadata + stages only.
 * Later stages must stay omitted (not empty arrays) until actually run.
 */
export type DeterministicVisualFacts = {
  schemaVersion: typeof DETERMINISTIC_VISUAL_SCHEMA;
  assetId: string;
  contentHash?: string;
  metadata: DeterministicMediaMetadata;
  analysisVersion: typeof DETERMINISTIC_ANALYZER_VERSION;
  warnings: string[];
  /** Overall visual placeholder until semantic layer exists. B1 stays PARTIAL. */
  status: DeterministicAnalysisStatus;
  /** Deterministic-only pipeline status. READY does not mean semantic visual READY. */
  deterministicStatus?: DeterministicAnalysisStatus;
  completedStages: VisualAnalysisStage[];
  samplingPlan?: SamplingPlan;
  frameSamplesSummary?: FrameSamplesSummary[];
  frameDifferences?: FrameDifference[];
  frameStatsAggregate?: FrameStatsAggregate;
  borderCandidates?: AggregatedRegionHeuristics['borderCandidates'];
  emptyRegionCandidates?: AggregatedRegionHeuristics['emptyRegionCandidates'];
  topStructuredStripCandidates?: AggregatedRegionHeuristics['topStructuredStripCandidates'];
  motionSummary?: MotionSummary;
  temporalActivitySegments?: TemporalActivitySegment[];
  nearStaticRanges?: NearStaticRange[];
  longStaticCandidates?: LongStaticCandidate[];
  rapidChangeCandidates?: RapidChangeCandidate[];
  sceneChangeCandidates?: SceneChangeCandidate[];
  cropGeometryCandidates?: CropGeometryCandidate[];
  cropGeometryRanking?: CropGeometryRanking;
  cropScoringVersion?: string;
};

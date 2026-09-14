import { createHash } from 'node:crypto';
import { DETERMINISTIC_ANALYZER_VERSION, DETERMINISTIC_VISUAL_SCHEMA } from '../deterministic-visual.types.js';
import { FRAME_SAMPLING_CONFIG_VERSION } from '../frame/frame-analysis-config.js';
import { REGION_HEURISTIC_VERSION } from '../region/region-heuristic-config.js';
import { MOTION_HEURISTIC_VERSION } from '../motion/motion-config.js';
import { CROP_GEOMETRY_SCORING_VERSION } from '../crop/crop-config.js';

export const VISUAL_CACHE_NAMESPACE = 'production-v2/visual/deterministic';

export type DeterministicVisualCacheKeyInput = {
  contentHash: string;
  deterministicAnalyzerVersion?: string;
  samplingConfigVersion?: string;
  regionHeuristicVersion?: string;
  motionHeuristicVersion?: string;
  cropScoringVersion?: string;
};

export function currentCacheVersions(): Omit<Required<DeterministicVisualCacheKeyInput>, 'contentHash'> {
  return {
    deterministicAnalyzerVersion: DETERMINISTIC_ANALYZER_VERSION,
    samplingConfigVersion: FRAME_SAMPLING_CONFIG_VERSION,
    regionHeuristicVersion: REGION_HEURISTIC_VERSION,
    motionHeuristicVersion: MOTION_HEURISTIC_VERSION,
    cropScoringVersion: CROP_GEOMETRY_SCORING_VERSION,
  };
}

export function buildDeterministicVisualCacheKey(input: DeterministicVisualCacheKeyInput): string {
  const payload = {
    ns: VISUAL_CACHE_NAMESPACE,
    schema: DETERMINISTIC_VISUAL_SCHEMA,
    contentHash: input.contentHash,
    deterministicAnalyzerVersion: input.deterministicAnalyzerVersion ?? DETERMINISTIC_ANALYZER_VERSION,
    samplingConfigVersion: input.samplingConfigVersion ?? FRAME_SAMPLING_CONFIG_VERSION,
    regionHeuristicVersion: input.regionHeuristicVersion ?? REGION_HEURISTIC_VERSION,
    motionHeuristicVersion: input.motionHeuristicVersion ?? MOTION_HEURISTIC_VERSION,
    cropScoringVersion: input.cropScoringVersion ?? CROP_GEOMETRY_SCORING_VERSION,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Filesystem-safe key fragment. Hex only. */
export function cacheObjectName(cacheKey: string): string {
  const hex = cacheKey.replace(/[^a-f0-9]/gi, '').toLowerCase().slice(0, 64);
  return hex.length >= 16 ? `${hex}.json` : 'invalid.json';
}

export function truncateHash(hash: string | undefined): string | undefined {
  if (!hash) {
    return undefined;
  }
  return hash.slice(0, 12);
}

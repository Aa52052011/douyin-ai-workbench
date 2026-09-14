import type { BorderCandidate } from '../region/region-heuristic.types.js';
import { CROP_GEOMETRY_CONFIG } from './crop-config.js';
import type {
  CropGeometryCandidate,
  CropRisk,
  CropScoreCard,
  PlatformConflict,
  ReadabilityGeometryRisk,
} from './crop.types.js';
import { intersectNormalized, score01 } from './rect-math.js';
import type { WindowSimulation } from './simulate-window.js';

function readabilityRisk(sim: WindowSimulation): ReadabilityGeometryRisk {
  const minFill = Math.min(sim.destOnCanvas.width, sim.destOnCanvas.height);
  if (sim.effectiveScale < CROP_GEOMETRY_CONFIG.detailScaleHighRisk || sim.outputOccupancy < CROP_GEOMETRY_CONFIG.occupancyHighReadabilityRisk || minFill < 0.4) {
    return 'HIGH';
  }
  if (sim.outputOccupancy < CROP_GEOMETRY_CONFIG.occupancyMediumReadabilityRisk || sim.effectiveScale < 0.9) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function detailScaleScore(sim: WindowSimulation): number {
  const minFill = Math.min(sim.destOnCanvas.width, sim.destOnCanvas.height);
  const shrink = Math.min(1, sim.effectiveScale);
  return score01(0.35 * minFill + 0.65 * shrink);
}

function geometryBalanceScore(sim: WindowSimulation): number {
  const cx = sim.sourceRect.x + sim.sourceRect.width / 2;
  const cy = sim.sourceRect.y + sim.sourceRect.height / 2;
  const offset = Math.min(1, 2 * Math.hypot(cx - 0.5, cy - 0.5));
  return score01(1 - offset);
}

function borderCleanupScore(sim: WindowSimulation, borders: BorderCandidate[]): number {
  const persistent = borders.filter((b) => b.confidence >= CROP_GEOMETRY_CONFIG.heuristicConfidenceMin);
  if (persistent.length === 0) {
    return 2.5;
  }
  let cleaned = 0;
  for (const border of persistent) {
    const hit = intersectNormalized(sim.sourceRect, border.rect);
    const remain = hit ? (hit.width * hit.height) / Math.max(1e-9, border.rect.width * border.rect.height) : 0;
    if (remain < 0.25) {
      cleaned += 1;
    }
  }
  return score01(cleaned / persistent.length);
}

function platformSafetyScore(conflicts: PlatformConflict[]): number {
  if (conflicts.length === 0) {
    return 5;
  }
  const worst = Math.max(...conflicts.map((item) => item.overlapRatio));
  return score01(1 - worst);
}

export function buildCropRisk(input: {
  sim: WindowSimulation;
  maxSideTrimRatio: number;
  semanticUnknownRisk: boolean;
}): CropRisk {
  const lostAreaRatio = 1 - input.sim.retainedAreaRatio;
  const detailScaleRisk = readabilityRisk(input.sim);
  const reasons: string[] = [];
  if (lostAreaRatio >= CROP_GEOMETRY_CONFIG.lostAreaHighRisk) {
    reasons.push('HIGH_LOST_AREA_RATIO');
  } else if (lostAreaRatio >= CROP_GEOMETRY_CONFIG.lostAreaMediumRisk) {
    reasons.push('MEDIUM_LOST_AREA_RATIO');
  }
  if (input.maxSideTrimRatio >= CROP_GEOMETRY_CONFIG.trimHighRisk) {
    reasons.push('HIGH_SIDE_TRIM');
  } else if (input.maxSideTrimRatio >= CROP_GEOMETRY_CONFIG.trimMediumRisk) {
    reasons.push('MEDIUM_SIDE_TRIM');
  }
  if (input.semanticUnknownRisk) {
    reasons.push('SEMANTIC_UNKNOWN');
  }
  if (detailScaleRisk !== 'LOW') {
    reasons.push('READABILITY_GEOMETRY_PROXY');
  }
  let level: CropRisk['level'] = 'LOW';
  if (lostAreaRatio >= CROP_GEOMETRY_CONFIG.lostAreaHighRisk || input.maxSideTrimRatio >= CROP_GEOMETRY_CONFIG.trimHighRisk || (detailScaleRisk === 'HIGH' && input.sim.outputOccupancy < CROP_GEOMETRY_CONFIG.occupancyHighReadabilityRisk)) {
    level = 'HIGH';
  } else if (lostAreaRatio >= CROP_GEOMETRY_CONFIG.lostAreaMediumRisk || input.maxSideTrimRatio >= CROP_GEOMETRY_CONFIG.trimMediumRisk || input.semanticUnknownRisk || detailScaleRisk !== 'LOW') {
    level = 'MEDIUM';
  }
  return {
    level,
    lostAreaRatio,
    maxSideTrimRatio: input.maxSideTrimRatio,
    semanticUnknownRisk: input.semanticUnknownRisk,
    detailScaleRisk,
    reasons,
  };
}

export function scoreCropWindow(input: {
  sim: WindowSimulation;
  conflicts: PlatformConflict[];
  borders: BorderCandidate[];
  maxSideTrimRatio: number;
  semanticUnknownRisk: boolean;
}): { scores: CropScoreCard; cropRisk: CropRisk; readabilityGeometryRisk: ReadabilityGeometryRisk } {
  const cropRisk = buildCropRisk(input);
  const readabilityGeometryRisk = cropRisk.detailScaleRisk;
  const scores: CropScoreCard = {
    retainedAreaScore: score01(input.sim.retainedAreaRatio),
    outputOccupancyScore: score01(input.sim.outputOccupancy),
    detailScaleScore: detailScaleScore(input.sim),
    borderCleanupScore: borderCleanupScore(input.sim, input.borders),
    geometryBalanceScore: geometryBalanceScore(input.sim),
    platformSafetyScore: platformSafetyScore(input.conflicts),
    destructiveRiskScore: score01(input.sim.retainedAreaRatio) * (input.semanticUnknownRisk ? 0.85 : 1),
    overallScore: 0,
  };
  const w = CROP_GEOMETRY_CONFIG.weights;
  scores.overallScore =
    scores.retainedAreaScore * w.retainedAreaScore +
    scores.detailScaleScore * w.detailScaleScore +
    scores.destructiveRiskScore * w.destructiveRiskScore +
    scores.platformSafetyScore * w.platformSafetyScore +
    scores.geometryBalanceScore * w.geometryBalanceScore +
    scores.borderCleanupScore * w.borderCleanupScore +
    scores.outputOccupancyScore * w.outputOccupancyScore;
  scores.overallScore = Math.min(5, Math.max(0, scores.overallScore));
  return { scores, cropRisk, readabilityGeometryRisk };
}

export function applyRanking(candidates: CropGeometryCandidate[]): {
  ranked: CropGeometryCandidate[];
  closePairIds: Array<[string, string]>;
} {
  const ranked = [...candidates].sort((a, b) => b.scores.overallScore - a.scores.overallScore);
  ranked.forEach((item, index) => {
    item.geometryRank = index + 1;
  });
  const closePairIds: Array<[string, string]> = [];
  for (let i = 0; i < ranked.length - 1; i += 1) {
    const a = ranked[i]!;
    const b = ranked[i + 1]!;
    if (Math.abs(a.scores.overallScore - b.scores.overallScore) < CROP_GEOMETRY_CONFIG.closeScoreThreshold) {
      closePairIds.push([a.candidateId, b.candidateId]);
    }
  }
  return { ranked, closePairIds };
}

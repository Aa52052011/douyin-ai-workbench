import type { DeterministicMediaMetadata } from '../deterministic-visual.types.js';
import { validateNormalizedRect } from '../geometry/normalized-rect.js';
import type { NormalizedRect } from '../geometry/types.js';
import type { BorderCandidate, EmptyRegionCandidate, TopStructuredStripCandidate } from '../region/region-heuristic.types.js';
import { CROP_GEOMETRY_CONFIG, CROP_GEOMETRY_SCORING_VERSION } from './crop-config.js';
import type {
  CropGeometryCandidate,
  CropGeometryResult,
  CropStrategy,
  CropCandidateType,
  PlatformCanvasFixture,
} from './crop.types.js';
import { VERTICAL_SHORT_CANVAS_V1 } from './platform-canvas.fixture.js';
import { iouNormalized } from './rect-math.js';
import { applyRanking, scoreCropWindow } from './score-crop.js';
import { evaluatePlatformConflicts, simulateContainWindow, simulateCoverWindow, type WindowSimulation } from './simulate-window.js';

export type CropGeometryInput = {
  metadata: DeterministicMediaMetadata;
  borderCandidates?: BorderCandidate[];
  emptyRegionCandidates?: EmptyRegionCandidate[];
  topStructuredStripCandidates?: TopStructuredStripCandidate[];
  canvas?: PlatformCanvasFixture;
};

function sideOfEmpty(rect: NormalizedRect): 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | undefined {
  if (rect.x <= 0.02 && rect.width < 0.5) {
    return 'LEFT';
  }
  if (rect.x + rect.width >= 0.98 && rect.width < 0.5) {
    return 'RIGHT';
  }
  if (rect.y <= 0.02 && rect.height < 0.5) {
    return 'TOP';
  }
  if (rect.y + rect.height >= 0.98 && rect.height < 0.5) {
    return 'BOTTOM';
  }
  return undefined;
}

function finishCandidate(input: {
  candidateId: string;
  type: CropCandidateType;
  cropStrategy: CropStrategy;
  sim: WindowSimulation;
  canvas: PlatformCanvasFixture;
  borders: BorderCandidate[];
  signals: string[];
  warnings: string[];
  confidence: number;
  maxSideTrimRatio: number;
  semanticUnknownRisk: boolean;
  semanticUnconfirmed?: boolean;
}): CropGeometryCandidate | { invalid: true; warning: string } {
  const check = validateNormalizedRect(input.sim.sourceRect);
  if (!check.ok || input.sim.retainedAreaRatio <= 0) {
    return { invalid: true, warning: 'CROP_CANDIDATE_INVALID' };
  }
  const conflicts = evaluatePlatformConflicts(input.sim.destOnCanvas, input.canvas.avoidRegions);
  const scored = scoreCropWindow({
    sim: input.sim,
    conflicts,
    borders: input.borders,
    maxSideTrimRatio: input.maxSideTrimRatio,
    semanticUnknownRisk: input.semanticUnknownRisk,
  });
  return {
    candidateId: input.candidateId,
    type: input.type,
    sourceRect: input.sim.sourceRect,
    targetWidth: input.canvas.targetWidth,
    targetHeight: input.canvas.targetHeight,
    fitMode: input.sim.fitMode,
    cropStrategy: input.cropStrategy,
    confidence: Math.min(CROP_GEOMETRY_CONFIG.activityConfidenceCap, input.confidence),
    scores: scored.scores,
    cropRisk: scored.cropRisk,
    platformConflicts: conflicts,
    signals: input.signals,
    warnings: input.warnings,
    source: 'DETERMINISTIC_GEOMETRY',
    retainedAreaRatio: input.sim.retainedAreaRatio,
    outputOccupancy: input.sim.outputOccupancy,
    effectiveScale: input.sim.effectiveScale,
    lostAreaRatio: 1 - input.sim.retainedAreaRatio,
    readabilityGeometryRisk: scored.readabilityGeometryRisk,
    semanticUnconfirmed: input.semanticUnconfirmed,
  };
}

function collectTrims(input: CropGeometryInput): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  remaining: number;
  signals: string[];
  warnings: string[];
  confidence: number;
} {
  const borders = input.borderCandidates ?? [];
  const empties = input.emptyRegionCandidates ?? [];
  const signals: string[] = [];
  const warnings: string[] = [];
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  const confidences: number[] = [];

  const apply = (side: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM', raw: number, signal: string, confidence: number) => {
    if (raw <= 0) {
      return;
    }
    let trim = raw;
    if (trim > CROP_GEOMETRY_CONFIG.maxTrimRatioPerSide) {
      trim = CROP_GEOMETRY_CONFIG.maxTrimRatioPerSide;
      warnings.push('TRIM_CAPPED_MAX_PER_SIDE');
    }
    if (side === 'LEFT') left = Math.max(left, trim);
    if (side === 'RIGHT') right = Math.max(right, trim);
    if (side === 'TOP') top = Math.max(top, trim);
    if (side === 'BOTTOM') bottom = Math.max(bottom, trim);
    signals.push(signal);
    confidences.push(confidence);
  };

  for (const border of borders) {
    if (border.confidence < CROP_GEOMETRY_CONFIG.heuristicConfidenceMin) {
      continue;
    }
    if (border.classification !== 'DARK_UNIFORM' && border.classification !== 'LIGHT_UNIFORM') {
      continue;
    }
    const signal =
      border.side === 'LEFT'
        ? 'PERSISTENT_LEFT_BORDER'
        : border.side === 'RIGHT'
          ? 'PERSISTENT_RIGHT_BORDER'
          : border.side === 'TOP'
            ? 'PERSISTENT_TOP_BORDER'
            : 'PERSISTENT_BOTTOM_BORDER';
    apply(border.side, border.normalizedSize, signal, border.confidence);
  }

  for (const empty of empties) {
    if (!empty.edgeBiased || empty.occupancyRatio < CROP_GEOMETRY_CONFIG.emptyMinOccupancy) {
      continue;
    }
    if (empty.confidence < CROP_GEOMETRY_CONFIG.emptyTrimConfidenceMin) {
      continue;
    }
    const side = sideOfEmpty(empty.rect);
    if (!side) {
      continue;
    }
    const size = side === 'LEFT' || side === 'RIGHT' ? empty.rect.width : empty.rect.height;
    apply(side, size, 'EMPTY_EDGE_REGION', empty.confidence * 0.85);
  }

  return {
    left,
    right,
    top,
    bottom,
    remaining: (1 - left - right) * (1 - top - bottom),
    signals,
    warnings,
    confidence: confidences.length ? Math.min(...confidences) : 0,
  };
}

export function generateCropGeometryCandidates(input: CropGeometryInput): CropGeometryResult {
  const canvas = input.canvas ?? VERTICAL_SHORT_CANVAS_V1;
  const warnings: string[] = [];
  const raw: CropGeometryCandidate[] = [];
  const { width: sourceWidth, height: sourceHeight } = input.metadata;
  const borders = input.borderCandidates ?? [];
  const full: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

  const push = (row: ReturnType<typeof finishCandidate>) => {
    if ('invalid' in row) {
      warnings.push(row.warning);
      return;
    }
    raw.push(row);
  };

  try {
    const cover = simulateCoverWindow(sourceWidth, sourceHeight, canvas.targetWidth, canvas.targetHeight, full);
    push(
      finishCandidate({
        candidateId: 'crop-center',
        type: 'CENTER',
        cropStrategy: 'CENTERED_COVER',
        sim: cover,
        canvas,
        borders,
        signals: ['CENTERED_COVER_GEOMETRY'],
        warnings: cover.retainedAreaRatio < CROP_GEOMETRY_CONFIG.minRetainedAreaRatio ? ['CENTER_LOW_RETAINED_AREA'] : [],
        confidence: CROP_GEOMETRY_CONFIG.centerConfidence,
        maxSideTrimRatio: Math.max(cover.sourceRect.x, 1 - (cover.sourceRect.x + cover.sourceRect.width), cover.sourceRect.y, 1 - (cover.sourceRect.y + cover.sourceRect.height)),
        semanticUnknownRisk: cover.retainedAreaRatio < 0.95,
      }),
    );
  } catch {
    warnings.push('CROP_CANDIDATE_INVALID');
  }

  try {
    const contain = simulateContainWindow(sourceWidth, sourceHeight, canvas.targetWidth, canvas.targetHeight, full);
    push(
      finishCandidate({
        candidateId: 'crop-contain',
        type: 'CONTAIN',
        cropStrategy: 'FULL_CONTAIN',
        sim: contain,
        canvas,
        borders,
        signals: ['FULL_SOURCE_CONTAIN'],
        warnings: contain.letterbox || contain.pillarbox ? ['LETTERBOX_OR_PILLARBOX_GEOMETRY'] : [],
        confidence: CROP_GEOMETRY_CONFIG.containConfidence,
        maxSideTrimRatio: 0,
        semanticUnknownRisk: false,
      }),
    );
  } catch {
    warnings.push('CROP_CANDIDATE_INVALID');
  }

  const trims = collectTrims(input);
  if (trims.signals.length > 0) {
    if (trims.remaining < CROP_GEOMETRY_CONFIG.minRetainedAreaRatio) {
      warnings.push('SAFE_GEOMETRY_BELOW_MIN_RETAINED_AREA');
    } else {
      const remaining: NormalizedRect = {
        x: trims.left,
        y: trims.top,
        width: 1 - trims.left - trims.right,
        height: 1 - trims.top - trims.bottom,
      };
      const check = validateNormalizedRect(remaining);
      if (!check.ok) {
        warnings.push('CROP_CANDIDATE_INVALID');
      } else {
        try {
          const sim = simulateContainWindow(sourceWidth, sourceHeight, canvas.targetWidth, canvas.targetHeight, remaining);
          const center = raw.find((item) => item.type === 'CENTER');
          if (center && iouNormalized(sim.sourceRect, center.sourceRect) >= CROP_GEOMETRY_CONFIG.duplicateIou) {
            center.signals = [...new Set([...center.signals, ...trims.signals])];
            center.duplicateCandidateOf = center.duplicateCandidateOf ?? 'crop-safe-geometry';
            warnings.push('SAFE_GEOMETRY_DEDUPED_NEAR_CENTER');
          } else {
            push(
              finishCandidate({
                candidateId: 'crop-safe-geometry',
                type: 'SAFE_GEOMETRY',
                cropStrategy: 'TRIM_THEN_CONTAIN',
                sim,
                canvas,
                borders,
                signals: trims.signals,
                warnings: trims.warnings,
                confidence: Math.min(0.8, trims.confidence),
                maxSideTrimRatio: Math.max(trims.left, trims.right, trims.top, trims.bottom),
                semanticUnknownRisk: true,
              }),
            );
          }
        } catch {
          warnings.push('CROP_CANDIDATE_INVALID');
        }
      }
    }
  }

  const strip = input.topStructuredStripCandidates?.[0];
  if (strip && strip.confidence > 0) {
    let top = strip.heightRatio;
    const topWarnings = ['TOP_TRIM_SEMANTIC_UNCONFIRMED'];
    if (top > CROP_GEOMETRY_CONFIG.maxTrimRatioPerSide) {
      top = CROP_GEOMETRY_CONFIG.maxTrimRatioPerSide;
      topWarnings.push('TRIM_CAPPED_MAX_PER_SIDE');
    }
    const remaining: NormalizedRect = { x: 0, y: top, width: 1, height: 1 - top };
    if (remaining.height < CROP_GEOMETRY_CONFIG.minRetainedAreaRatio) {
      warnings.push('TOP_TRIM_BELOW_MIN_RETAINED_AREA');
    } else if (!validateNormalizedRect(remaining).ok) {
      warnings.push('CROP_CANDIDATE_INVALID');
    } else {
      try {
        const sim = simulateContainWindow(sourceWidth, sourceHeight, canvas.targetWidth, canvas.targetHeight, remaining);
        const diversityPenalty = strip.uniqueSampleCount < 2 ? 0.5 : strip.uniqueSampleCount < 3 ? 0.7 : 1;
        push(
          finishCandidate({
            candidateId: 'crop-top-trim',
            type: 'TOP_TRIM_CANDIDATE',
            cropStrategy: 'TRIM_THEN_CONTAIN',
            sim,
            canvas,
            borders,
            signals: ['TOP_STRUCTURED_STRIP_HEURISTIC'],
            warnings: topWarnings,
            confidence: Math.min(CROP_GEOMETRY_CONFIG.topTrimConfidenceCap, strip.confidence * diversityPenalty),
            maxSideTrimRatio: top,
            semanticUnknownRisk: true,
            semanticUnconfirmed: true,
          }),
        );
      } catch {
        warnings.push('CROP_CANDIDATE_INVALID');
      }
    }
  }

  const { ranked, closePairIds } = applyRanking(raw);
  return {
    candidates: ranked,
    ranking: {
      kind: 'DETERMINISTIC_GEOMETRY_RANK',
      cropScoringVersion: CROP_GEOMETRY_SCORING_VERSION,
      rankedCandidateIds: ranked.map((item) => item.candidateId),
      closePairIds,
      topGeometryCandidateId: ranked[0]?.candidateId,
      note: 'NOT_FINAL_DIRECTOR_SELECTION',
    },
    cropScoringVersion: CROP_GEOMETRY_SCORING_VERSION,
    warnings,
  };
}

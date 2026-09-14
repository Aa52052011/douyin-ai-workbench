import type { LumaFrame } from '../frame/luma-stats.js';
import type { NormalizedRect } from '../geometry/types.js';
import { HEURISTIC_SOURCE, REGION_HEURISTIC_CONFIG, type BorderClassification, type BorderSide } from './region-heuristic-config.js';
import type { BorderCandidate, EmptyRegionCandidate, FrameRegionHeuristics, TopStructuredStripCandidate } from './region-heuristic.types.js';

type StripStats = { mean: number; variance: number; std: number };

function pixel(frame: LumaFrame, x: number, y: number): number {
  return frame.pixels[y * frame.width + x] ?? 0;
}

function stripStats(frame: LumaFrame, x0: number, y0: number, x1: number, y1: number): StripStats {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sum += pixel(frame, x, y);
      n += 1;
    }
  }
  if (n === 0) {
    return { mean: 0, variance: 0, std: 0 };
  }
  const mean = sum / n;
  let varSum = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const d = pixel(frame, x, y) - mean;
      varSum += d * d;
    }
  }
  const variance = varSum / n;
  return { mean, variance, std: Math.sqrt(variance) };
}

function uniformityScore(std: number): number {
  return Math.max(0, 1 - std / 40);
}

function classify(mean: number, std: number): BorderClassification {
  if (std > REGION_HEURISTIC_CONFIG.uniformityStdDevMax) {
    return 'UNKNOWN';
  }
  if (mean <= REGION_HEURISTIC_CONFIG.darkMeanMax) {
    return 'DARK_UNIFORM';
  }
  if (mean >= REGION_HEURISTIC_CONFIG.lightMeanMin) {
    return 'LIGHT_UNIFORM';
  }
  return 'NEUTRAL_UNIFORM';
}

function growUniformBorder(frame: LumaFrame, side: BorderSide): BorderCandidate | undefined {
  const { width, height } = frame;
  const maxRatio = REGION_HEURISTIC_CONFIG.borderMaxRatio;
  const minRatio = REGION_HEURISTIC_CONFIG.borderMinRatio;
  const minPx = Math.max(REGION_HEURISTIC_CONFIG.borderMinAnalysisPixels, Math.ceil(minRatio * (side === 'LEFT' || side === 'RIGHT' ? width : height)));
  const maxPx = Math.floor(maxRatio * (side === 'LEFT' || side === 'RIGHT' ? width : height));
  if (maxPx < minPx) {
    return undefined;
  }
  let best: { sizePx: number; stats: StripStats } | undefined;
  for (let size = minPx; size <= maxPx; size += 1) {
    let stats: StripStats;
    if (side === 'TOP') {
      stats = stripStats(frame, 0, 0, width, size);
    } else if (side === 'BOTTOM') {
      stats = stripStats(frame, 0, height - size, width, height);
    } else if (side === 'LEFT') {
      stats = stripStats(frame, 0, 0, size, height);
    } else {
      stats = stripStats(frame, width - size, 0, width, height);
    }
    if (stats.std <= REGION_HEURISTIC_CONFIG.uniformityStdDevMax) {
      let interior: StripStats;
      if (side === 'TOP') {
        interior = stripStats(frame, 0, size, width, height);
      } else if (side === 'BOTTOM') {
        interior = stripStats(frame, 0, 0, width, height - size);
      } else if (side === 'LEFT') {
        interior = stripStats(frame, size, 0, width, height);
      } else {
        interior = stripStats(frame, 0, 0, width - size, height);
      }
      const contrastVsInterior = Math.abs(interior.mean - stats.mean) + Math.max(0, interior.std - stats.std);
      if (contrastVsInterior >= 12) {
        best = { sizePx: size, stats };
      }
    } else if (best) {
      break;
    }
  }
  if (!best) {
    return undefined;
  }
  const classification = classify(best.stats.mean, best.stats.std);
  if (classification === 'UNKNOWN') {
    return undefined;
  }
  const isVertical = side === 'LEFT' || side === 'RIGHT';
  const size = best.sizePx / (isVertical ? width : height);
  const rect: NormalizedRect =
    side === 'TOP'
      ? { x: 0, y: 0, width: 1, height: size }
      : side === 'BOTTOM'
        ? { x: 0, y: 1 - size, width: 1, height: size }
        : side === 'LEFT'
          ? { x: 0, y: 0, width: size, height: 1 }
          : { x: 1 - size, y: 0, width: size, height: 1 };
  return {
    side,
    rect,
    normalizedSize: size,
    meanLuma: best.stats.mean,
    lumaVariance: best.stats.variance,
    uniformityScore: uniformityScore(best.stats.std),
    darknessScore: 1 - best.stats.mean / 255,
    persistenceRatio: 1,
    persistenceRatioAllSamples: 1,
    persistenceRatioDedupWeighted: 1,
    uniqueSampleCount: 1,
    confidence: 0,
    source: HEURISTIC_SOURCE.FRAME_LUMA_HEURISTIC,
    classification,
  };
}

function rowMeanAbsDiff(frame: LumaFrame, y0: number, y1: number): number {
  let sum = 0;
  for (let x = 0; x < frame.width; x += 1) {
    sum += Math.abs(pixel(frame, x, y0) - pixel(frame, x, y1));
  }
  return sum / frame.width;
}

/**
 * Structured top band: not a named UI. Never labeled browser chrome.
 */
function detectTopStructuredStrip(frame: LumaFrame, topBorder?: BorderCandidate): TopStructuredStripCandidate | undefined {
  const minH = Math.max(2, Math.ceil(REGION_HEURISTIC_CONFIG.topStripMinHeight * frame.height));
  const maxH = Math.floor(REGION_HEURISTIC_CONFIG.topStripMaxHeight * frame.height);
  let bestRow = -1;
  let bestBoundary = 0;
  for (let y = minH; y <= maxH; y += 1) {
    const strength = rowMeanAbsDiff(frame, y - 1, y);
    if (strength > bestBoundary) {
      bestBoundary = strength;
      bestRow = y;
    }
  }
  if (bestRow < 0 || bestBoundary < REGION_HEURISTIC_CONFIG.topBoundaryMin) {
    return undefined;
  }
  const internal = stripStats(frame, 0, 0, frame.width, bestRow);
  if (internal.std < REGION_HEURISTIC_CONFIG.topInternalStdMin) {
    return undefined;
  }
  if (topBorder && topBorder.uniformityScore > 0.85 && topBorder.normalizedSize >= bestRow / frame.height - 0.02) {
    return undefined;
  }
  const heightRatio = bestRow / frame.height;
  return {
    rect: { x: 0, y: 0, width: 1, height: heightRatio },
    heightRatio,
    horizontalBoundaryStrength: bestBoundary,
    internalContrastProxy: internal.std / 255,
    persistenceRatio: 1,
    persistenceRatioAllSamples: 1,
    persistenceRatioDedupWeighted: 1,
    uniqueSampleCount: 1,
    stabilityScore: 1,
    confidence: 0,
    source: HEURISTIC_SOURCE.FRAME_LUMA_HEURISTIC,
  };
}

type Cell = { gx: number; gy: number; variance: number; mean: number };

function emptyCells(frame: LumaFrame): Cell[] {
  const g = REGION_HEURISTIC_CONFIG.emptyGridSize;
  const cells: Cell[] = [];
  const cellW = frame.width / g;
  const cellH = frame.height / g;
  for (let gy = 0; gy < g; gy += 1) {
    for (let gx = 0; gx < g; gx += 1) {
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const x1 = Math.min(frame.width, Math.floor((gx + 1) * cellW));
      const y1 = Math.min(frame.height, Math.floor((gy + 1) * cellH));
      const stats = stripStats(frame, x0, y0, Math.max(x0 + 1, x1), Math.max(y0 + 1, y1));
      if (stats.variance <= REGION_HEURISTIC_CONFIG.emptyVarianceThreshold) {
        cells.push({ gx, gy, variance: stats.variance, mean: stats.mean });
      }
    }
  }
  return cells;
}

function mergeEmptyCells(cells: Cell[]): EmptyRegionCandidate[] {
  const g = REGION_HEURISTIC_CONFIG.emptyGridSize;
  const key = (c: Cell) => `${c.gx},${c.gy}`;
  const set = new Set(cells.map(key));
  const visited = new Set<string>();
  const out: EmptyRegionCandidate[] = [];
  for (const start of cells) {
    const sk = key(start);
    if (visited.has(sk)) {
      continue;
    }
    const stack = [start];
    const group: Cell[] = [];
    visited.add(sk);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = `${cur.gx + dx},${cur.gy + dy}`;
        if (set.has(n) && !visited.has(n)) {
          visited.add(n);
          const found = cells.find((c) => c.gx === cur.gx + dx && c.gy === cur.gy + dy);
          if (found) {
            stack.push(found);
          }
        }
      }
    }
    const minX = Math.min(...group.map((c) => c.gx));
    const minY = Math.min(...group.map((c) => c.gy));
    const maxX = Math.max(...group.map((c) => c.gx));
    const maxY = Math.max(...group.map((c) => c.gy));
    const occupancy = ((maxX - minX + 1) * (maxY - minY + 1)) / (g * g);
    if (occupancy < REGION_HEURISTIC_CONFIG.emptyMinAreaRatio) {
      continue;
    }
    const edgeBiased = minX === 0 || minY === 0 || maxX === g - 1 || maxY === g - 1;
    const avgVar = group.reduce((s, c) => s + c.variance, 0) / group.length;
    out.push({
      rect: { x: minX / g, y: minY / g, width: (maxX - minX + 1) / g, height: (maxY - minY + 1) / g },
      textureProxy: avgVar,
      lumaVariance: avgVar,
      occupancyRatio: occupancy,
      edgeBiased,
      persistenceRatio: 1,
      persistenceRatioAllSamples: 1,
      persistenceRatioDedupWeighted: 1,
      uniqueSampleCount: 1,
      confidence: 0,
      source: HEURISTIC_SOURCE.FRAME_LUMA_HEURISTIC,
    });
  }
  out.sort((a, b) => Number(b.edgeBiased) - Number(a.edgeBiased) || b.occupancyRatio - a.occupancyRatio);
  return out.slice(0, 4);
}

export function detectFrameRegionHeuristics(
  frame: LumaFrame,
  sampleId: string,
  timestampMs: number,
): FrameRegionHeuristics {
  const borders = (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as const)
    .map((side) => growUniformBorder(frame, side))
    .filter((item): item is BorderCandidate => Boolean(item));
  const topBorder = borders.find((item) => item.side === 'TOP');
  const topStructuredStrip = detectTopStructuredStrip(frame, topBorder);
  const emptyRegions = mergeEmptyCells(emptyCells(frame));
  return { sampleId, timestampMs, borders, emptyRegions, topStructuredStrip };
}

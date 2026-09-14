export type LumaFrame = {
  width: number;
  height: number;
  pixels: Buffer;
};

export type LumaStatistics = {
  averageLuma: number;
  lumaStdDev: number;
  minLuma: number;
  maxLuma: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  contrastProxy: number;
  lumaHistogram16?: number[];
};

export function computeLumaStatistics(
  frame: LumaFrame,
  darkMax: number,
  brightMin: number,
): LumaStatistics {
  const { pixels } = frame;
  const n = pixels.byteLength;
  if (n === 0) {
    return {
      averageLuma: 0,
      lumaStdDev: 0,
      minLuma: 0,
      maxLuma: 0,
      darkPixelRatio: 0,
      brightPixelRatio: 0,
      contrastProxy: 0,
    };
  }
  let sum = 0;
  let min = 255;
  let max = 0;
  let dark = 0;
  let bright = 0;
  const hist = new Array<number>(16).fill(0);
  for (let i = 0; i < n; i += 1) {
    const v = pixels[i] ?? 0;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v <= darkMax) dark += 1;
    if (v >= brightMin) bright += 1;
    hist[Math.min(15, Math.floor(v / 16))] += 1;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (pixels[i] ?? 0) - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  return {
    averageLuma: mean,
    lumaStdDev: std,
    minLuma: min,
    maxLuma: max,
    darkPixelRatio: dark / n,
    brightPixelRatio: bright / n,
    contrastProxy: std / 255,
    lumaHistogram16: hist,
  };
}

/** Higher = sharper. Laplacian-like variance on luma. Relative ranking only. */
export function computeSharpnessProxy(frame: LumaFrame): number {
  const { width, height, pixels } = frame;
  if (width < 3 || height < 3) {
    return 0;
  }
  const acc: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * (pixels[i] ?? 0) -
        (pixels[i - 1] ?? 0) -
        (pixels[i + 1] ?? 0) -
        (pixels[i - width] ?? 0) -
        (pixels[i + width] ?? 0);
      acc.push(lap);
    }
  }
  const mean = acc.reduce((s, v) => s + v, 0) / acc.length;
  const variance = acc.reduce((s, v) => s + (v - mean) ** 2, 0) / acc.length;
  return variance;
}

export function meanAbsoluteLumaDelta(a: LumaFrame, b: LumaFrame): { delta: number; normalizedDelta: number } {
  const n = Math.min(a.pixels.byteLength, b.pixels.byteLength);
  if (n === 0 || a.width !== b.width || a.height !== b.height) {
    return { delta: 255, normalizedDelta: 1 };
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += Math.abs((a.pixels[i] ?? 0) - (b.pixels[i] ?? 0));
  }
  const delta = sum / n;
  return { delta, normalizedDelta: delta / 255 };
}

/** 1 = identical analysis luma, 0 = maximally different. */
export function lumaSimilarity(a: LumaFrame, b: LumaFrame): number {
  return 1 - meanAbsoluteLumaDelta(a, b).normalizedDelta;
}

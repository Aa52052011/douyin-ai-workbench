const SCORE_KEYS = /Score$/;
const RATIO_KEYS =
  /(PairRatio|lostAreaRatio|overlapRatio|retainedAreaRatio|normalizedDelta|persistenceRatio|occupancyRatio|heightRatio|PixelRatio|outputOccupancy|^confidence$|^strength$)$/i;
const MS_KEYS = /(Ms|DurationMs|timestampMs)$/i;

export type NumericIssue = { path: string; kind: string; value: unknown };

export function collectNumericIssues(value: unknown, path = 'root', acc: NumericIssue[] = []): NumericIssue[] {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      acc.push({ path, kind: 'non_finite', value });
      return acc;
    }
    const leaf = path.split('.').pop() ?? '';
    if (SCORE_KEYS.test(leaf) && !leaf.endsWith('darknessScore') && !leaf.endsWith('uniformityScore') && !leaf.endsWith('stabilityScore') && (value < 0 || value > 5)) {
      acc.push({ path, kind: 'score_range', value });
    }
    if (
      RATIO_KEYS.test(leaf) &&
      (value < 0 || value > 1 + 1e-6) &&
      !leaf.endsWith('Scale')
    ) {
      acc.push({ path, kind: 'ratio_range', value });
    }
    if ((/^confidence$/i.test(leaf) || leaf.endsWith('Confidence')) && (value < 0 || value > 1)) {
      acc.push({ path, kind: 'confidence_range', value });
    }
    if (MS_KEYS.test(leaf) && value < 0) {
      acc.push({ path, kind: 'negative_ms', value });
    }
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectNumericIssues(item, `${path}[${i}]`, acc));
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectNumericIssues(child, `${path}.${key}`, acc);
    }
  }
  return acc;
}

export function rectIsValid(rect: { x: number; y: number; width: number; height: number } | undefined): boolean {
  if (!rect) {
    return false;
  }
  return (
    rect.x >= -1e-9 &&
    rect.y >= -1e-9 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width <= 1 + 1e-9 &&
    rect.y + rect.height <= 1 + 1e-9
  );
}

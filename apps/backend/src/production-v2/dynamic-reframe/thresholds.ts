/** Engineering thresholds — not a product SLA. */
export const DYNAMIC_REFRAME_THRESHOLDS = {
  sourceDurationMs: 35107,
  establishContextMaxMs: 2000,
  minHoldUiMs: 1800,
  minHoldTextMs: 2500,
  minHoldContextMs: 1500,
  mergeIouMin: 0.72,
  minAvgReframeIntervalMs: 1000,
  mechanicalPulseMs: 500,
  boundaryMarginMs: 250,
  chromeMaxCoverage: 0.25,
  hardExcludeMaxIncluded: 0.05,
  mustKeepMin: 0.95,
  focusPad: 0.08,
  claimCriticalTextMinCoverage: 0.9,
} as const;

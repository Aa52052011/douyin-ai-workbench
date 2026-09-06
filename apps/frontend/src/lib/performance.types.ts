export type MetricSnapshotRecord = {
  observedAt: string;
  createdAt?: string;
  source?: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  favorites?: number | null;
  averageWatchTimeSeconds?: number | null;
  completionRate?: number | null;
  newFollowers?: number | null;
};

export type MetricFormState = {
  views: string;
  likes: string;
  comments: string;
  shares: string;
  favorites: string;
  completionRatePercent: string;
  averageWatchTimeSeconds: string;
  newFollowers: string;
  observedAt: string;
};

export type PerformanceInsightRecord = {
  code?: string;
  category?: string;
  severity?: string;
  confidence?: string;
};

export type PerformanceInsightResult = {
  dataSufficiency?: string;
  insights?: PerformanceInsightRecord[];
};

export type PerformanceSummaryRecord = {
  snapshotCount?: number;
  latest?: {
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    favorites?: number | null;
    averageWatchTimeSeconds?: number | null;
    completionRate?: number | null;
    newFollowers?: number | null;
    likeRate?: number | null;
    commentRate?: number | null;
    shareRate?: number | null;
    favoriteRate?: number | null;
    observedAt?: string;
  } | null;
};

export type MetricCardView = {
  label: string;
  value: string;
};

export type InsightView = {
  text: string;
  isQuality: boolean;
};

export const PERFORMANCE_RAW_TERMS = [
  "PublicationMetricSnapshot",
  "PerformanceFeedbackService",
  "collectionKey",
  "sourceJobId",
  "providerMetadata",
  "MetricSource",
] as const;

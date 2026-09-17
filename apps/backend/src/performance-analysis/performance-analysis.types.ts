export type AnalysisWindowKind = 'LATEST_ONLY' | 'FIRST_24H' | 'FIRST_48H' | 'FIRST_7D' | 'CUSTOM';
export type WindowCoverage = 'COMPLETE' | 'PARTIAL_WINDOW';
export type DataSufficiencyV1 = 'EMPTY' | 'SPARSE' | 'BASIC' | 'GOOD' | 'RICH';
export type BenchmarkContextV1 =
  | 'NONE'
  | 'LIMITED'
  | 'ACCOUNT_HISTORY'
  | 'CONTENT_SERIES'
  | 'MANUAL_BENCHMARK'
  | 'OFFICIAL_PLATFORM_BENCHMARK_FUTURE';
export type CausalityLevel = 'OBSERVED' | 'CORRELATED' | 'PLAUSIBLE' | 'HYPOTHESIS' | 'INSUFFICIENT_EVIDENCE';
export type AttributionConfidenceV1 = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type FindingType = 'STRENGTH' | 'WEAKNESS' | 'OBSERVATION' | 'RISK' | 'OPPORTUNITY' | 'HYPOTHESIS';
export type FindingDimension =
  | 'REACH'
  | 'ENGAGEMENT'
  | 'DISCUSSION'
  | 'SHARING'
  | 'COLLECTION'
  | 'FOLLOWER_RESPONSE'
  | 'CONTENT_MESSAGE_FIT'
  | 'SCRIPT_HOOK'
  | 'VISUAL_EXECUTION'
  | 'CTA'
  | 'ACCOUNT_POSITIONING_ALIGNMENT';
export type RecommendationTarget =
  | 'CONTENT_PLANNING'
  | 'SCRIPT_GENERATION'
  | 'DIRECTOR'
  | 'ACCOUNT_POSITIONING'
  | 'PUBLICATION_METADATA';
export type RecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type FeedbackCycleStatus =
  | 'GENERATED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'APPLIED_TO_NEXT_PLAN';
export type RecommendationReviewAction = 'APPROVE' | 'REJECT' | 'DEFER';

export type MetricSnapshotInputV1 = {
  id: string;
  publishedPostId: string;
  capturedAt: string;
  source: string;
  playCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  followerDelta: number | null;
  fixture?: boolean;
};

export type EvidenceRefV1 = {
  kind: 'METRIC_SNAPSHOT' | 'DERIVED_METRIC' | 'SCRIPT_SECTION' | 'CONTENT_PLAN_TOPIC' | 'ARTIFACT_METADATA' | 'PUBLICATION_METADATA';
  id: string;
  label: string;
};

export type PerformanceFindingV1 = {
  findingId: string;
  dimension: FindingDimension;
  type: FindingType;
  statement: string;
  evidenceRefs: EvidenceRefV1[];
  confidence: AttributionConfidenceV1;
  causalityLevel: CausalityLevel;
  attributionConfidence: AttributionConfidenceV1;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  insufficientEvidence: boolean;
  recommendedAction?: string;
};

export type PerformanceRecommendationV1 = {
  recommendationId: string;
  targetAgent: RecommendationTarget;
  targetArea: string;
  recommendation: string;
  reason: string;
  evidenceRefs: EvidenceRefV1[];
  confidence: AttributionConfidenceV1;
  priority: RecommendationPriority;
  requiresHumanReview: true;
  reviewStatus: 'PENDING' | 'APPROVED' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED';
};

export type RetentionAvailabilityV1 = {
  retentionCurve: 'NOT_AVAILABLE';
  completionRate: 'NOT_AVAILABLE';
  averageWatchTime: 'NOT_AVAILABLE';
  retention2s: 'NOT_AVAILABLE';
  retention5s: 'NOT_AVAILABLE';
};

export const CONFIRMED_CAUSE_FORBIDDEN = 'CONFIRMED_CAUSE';

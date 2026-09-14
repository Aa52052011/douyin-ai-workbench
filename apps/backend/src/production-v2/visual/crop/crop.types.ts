import type { FitMode, NormalizedRect } from '../geometry/types.js';

export const CROP_CANDIDATE_TYPES = ['CENTER', 'CONTAIN', 'SAFE_GEOMETRY', 'TOP_TRIM_CANDIDATE'] as const;
export type CropCandidateType = (typeof CROP_CANDIDATE_TYPES)[number];

export type CropStrategy = 'CENTERED_COVER' | 'FULL_CONTAIN' | 'TRIM_THEN_CONTAIN';

export type CropRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReadabilityGeometryRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type CropScoreCard = {
  retainedAreaScore: number;
  outputOccupancyScore: number;
  detailScaleScore: number;
  borderCleanupScore: number;
  geometryBalanceScore: number;
  platformSafetyScore: number;
  destructiveRiskScore: number;
  overallScore: number;
};

export type CropRisk = {
  level: CropRiskLevel;
  lostAreaRatio: number;
  maxSideTrimRatio: number;
  semanticUnknownRisk: boolean;
  detailScaleRisk: ReadabilityGeometryRisk;
  reasons: string[];
};

export type PlatformConflict = {
  regionType: 'TOP_RISK' | 'BOTTOM_CAPTION_RISK' | 'RIGHT_INTERACTION_RISK';
  overlapRatio: number;
  severity: CropRiskLevel;
  reason: 'EXPOSES_CONTENT_INTO_AVOID_REGION';
};

export type CropGeometryCandidate = {
  candidateId: string;
  type: CropCandidateType;
  sourceRect: NormalizedRect;
  targetWidth: number;
  targetHeight: number;
  fitMode: FitMode;
  cropStrategy: CropStrategy;
  confidence: number;
  scores: CropScoreCard;
  cropRisk: CropRisk;
  platformConflicts: PlatformConflict[];
  signals: string[];
  warnings: string[];
  source: 'DETERMINISTIC_GEOMETRY';
  retainedAreaRatio: number;
  outputOccupancy: number;
  effectiveScale: number;
  lostAreaRatio: number;
  readabilityGeometryRisk: ReadabilityGeometryRisk;
  semanticUnconfirmed?: boolean;
  geometryRank?: number;
  duplicateCandidateOf?: string;
};

export type CropGeometryRanking = {
  kind: 'DETERMINISTIC_GEOMETRY_RANK';
  cropScoringVersion: string;
  rankedCandidateIds: string[];
  closePairIds: Array<[string, string]>;
  topGeometryCandidateId?: string;
  note: 'NOT_FINAL_DIRECTOR_SELECTION';
};

export type CropGeometryResult = {
  candidates: CropGeometryCandidate[];
  ranking: CropGeometryRanking;
  cropScoringVersion: string;
  warnings: string[];
};

export type PlatformAvoidRegion = {
  regionType: PlatformConflict['regionType'];
  rect: NormalizedRect;
};

export type PlatformCanvasFixture = {
  profileId: string;
  targetWidth: number;
  targetHeight: number;
  avoidRegions: PlatformAvoidRegion[];
};

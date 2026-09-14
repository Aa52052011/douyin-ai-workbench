import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { ObservationSource, UncertaintyToken } from './observation.types.js';

export const AUTHENTICITY_TYPES = ['STALE', 'MOCK', 'DEMO', 'PLACEHOLDER', 'UNRELATED'] as const;
export type AuthenticityType = (typeof AUTHENTICITY_TYPES)[number];

/** Analyzer may not emit REAL or FAKE. */
export const TRUTH_LABELS = ['LIKELY_REAL', 'LIKELY_MOCK', 'UNCERTAIN'] as const;
export type TruthLabel = (typeof TRUTH_LABELS)[number];

export type ContentAuthenticityObservation = {
  type: AuthenticityType;
  confidence: number;
  evidence: string[];
  truthLabel: TruthLabel;
  uncertainty?: UncertaintyToken;
  source: ObservationSource;
};

export const WATERMARK_TYPES = ['PLATFORM', 'BRAND', 'EDITOR', 'UNKNOWN'] as const;
export type WatermarkType = (typeof WATERMARK_TYPES)[number];

export type WatermarkObservation = {
  region: NormalizedRect;
  type: WatermarkType;
  confidence: number;
  text?: string;
  brand?: string;
  source: ObservationSource;
};

export const PRIVACY_CATEGORIES = [
  'EMAIL',
  'PHONE',
  'NAME',
  'AVATAR',
  'ACCOUNT_ID',
  'ADDRESS',
  'TOKEN_LIKE',
  'QR_CODE',
  'FACE',
  'UNKNOWN_PERSONAL_INFO',
] as const;
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];

export type PrivacyObservation = {
  region: NormalizedRect;
  category: PrivacyCategory;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  source: ObservationSource;
};

export type DeveloperArtifactObservation = {
  kind:
    | 'LOCALHOST'
    | 'LOOPBACK_IP'
    | 'DEV_SERVER_LABEL'
    | 'DEBUG_OVERLAY'
    | 'EDITOR_CHROME'
    | 'TERMINAL'
    | 'TEST_DATA'
    | 'MOCK_LABEL'
    | 'PLACEHOLDER_LABEL';
  region?: NormalizedRect;
  textFragment?: string;
  ocrConfidence?: number;
  confidence: number;
  source: ObservationSource;
};

export type OcrFragment = {
  text: string;
  confidence: number;
  region: NormalizedRect;
  source: 'OCR';
  sanitized?: boolean;
};

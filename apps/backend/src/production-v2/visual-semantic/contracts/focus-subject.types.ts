import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { ObservationSource } from './observation.types.js';

export const UI_FOCUS_ROLES = [
  'PRIMARY_CONTENT',
  'SECONDARY_CONTENT',
  'CONTROL',
  'NAVIGATION',
  'STATUS',
  'UNKNOWN',
] as const;
export type UiFocusRole = (typeof UI_FOCUS_ROLES)[number];

export type UIFocusCandidate = {
  region: NormalizedRect;
  confidence: number;
  role: UiFocusRole;
  importanceSignals: string[];
  source: ObservationSource;
};

export const SUBJECT_TYPES = ['PERSON', 'FACE', 'PRODUCT', 'SCREEN', 'DOCUMENT'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type SubjectCandidate = {
  type: SubjectType;
  region: NormalizedRect;
  confidence: number;
  prominence: number;
  source: ObservationSource;
};

export type BrowserChromeObservation = {
  region: NormalizedRect;
  confidence: number;
  signals: Array<
    'TAB_LIKE_STRUCTURE' | 'ADDRESS_BAR_LIKE_STRUCTURE' | 'BROWSER_CONTROL_LAYOUT' | 'URL_LIKE_TEXT' | 'TOP_PERSISTENCE'
  >;
  source: ObservationSource;
};

export type ChromeFamily = 'BROWSER_CHROME' | 'OS_CHROME' | 'APP_WINDOW_CHROME';

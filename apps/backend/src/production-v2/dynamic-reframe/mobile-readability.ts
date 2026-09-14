import {
  HUMAN_MOBILE_READABILITY_VERSION,
  MOBILE_READABILITY_FAIL_CODES,
  MOBILE_READABILITY_STANDARD,
  type HumanMobileReadabilityStandardV1,
  type MobileReadabilityFailCode,
  type ReadabilityTarget,
  type ReframeIntent,
} from './types.js';

export const HUMAN_MOBILE_READABILITY_STANDARD: HumanMobileReadabilityStandardV1 = {
  schemaVersion: HUMAN_MOBILE_READABILITY_VERSION,
  standard: MOBILE_READABILITY_STANDARD,
  meaning: 'DOUYIN_DEFAULT_PORTRAIT_PLAYBACK_SIZE',
  notDesktopPreview: true,
  notBrowserFullscreen: true,
  passRequiresNoManualZoom: true,
  passRequiresNoPauseForBasicReading: true,
  failCodes: MOBILE_READABILITY_FAIL_CODES,
};

export function readabilityFails(input: {
  desktopOnly?: boolean;
  fullscreenOnly?: boolean;
  pauseRequired?: boolean;
  manualZoomRequired?: boolean;
  keyUiTooSmall?: boolean;
  claimTextUnreadable?: boolean;
}): MobileReadabilityFailCode[] {
  const codes: MobileReadabilityFailCode[] = [];
  if (input.desktopOnly) codes.push('DESKTOP_ONLY_READABLE');
  if (input.fullscreenOnly) codes.push('FULLSCREEN_ONLY_READABLE');
  if (input.pauseRequired) codes.push('PAUSE_REQUIRED_FOR_BASIC_READING');
  if (input.manualZoomRequired) codes.push('MANUAL_ZOOM_REQUIRED');
  if (input.keyUiTooSmall) codes.push('KEY_UI_TOO_SMALL');
  if (input.claimTextUnreadable) codes.push('CLAIM_CRITICAL_TEXT_UNREADABLE');
  return codes;
}

export function mobileReadabilityAccepted(fails: readonly MobileReadabilityFailCode[]): boolean {
  return fails.length === 0;
}

export function intentReadabilityTarget(intent: ReframeIntent, claimCriticalText: boolean): ReadabilityTarget {
  if (intent === 'ESTABLISH_CONTEXT' || intent === 'RETURN_TO_CONTEXT') return 'CONTEXT_ONLY';
  if (intent === 'FOCUS_TEXT' && claimCriticalText) return 'CLAIM_CRITICAL_READABLE';
  if (intent === 'FOCUS_TEXT') return 'READABLE';
  return 'READABLE';
}

export function establishingMayCarryClaimCritical(target: ReadabilityTarget): boolean {
  return target === 'CLAIM_CRITICAL_READABLE';
}

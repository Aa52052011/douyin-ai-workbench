import type { ProjectContextEvaluationInput } from './context.types.js';
import { hasFact, hasOverride } from './context-evidence.js';

export type DerivedFlags = {
  privacyBlocker: boolean;
  rightsBlocker: boolean;
  staleConfirmed: boolean;
  mockConfirmed: boolean;
  currentConfirmed: boolean;
  noKnownMock: boolean;
  forceAvoid: boolean;
  forcePreferred: boolean;
  productUi: boolean;
  navigation: boolean;
  contentPanel: boolean;
  browserChrome: boolean;
  localhost: boolean;
  emptyState: boolean;
  publishOps: boolean;
  productInfoChat: boolean;
  oldEmptyHome: boolean;
  truthRequiresCurrent: boolean;
  truthHardBlock: boolean;
};

export function deriveFlags(input: ProjectContextEvaluationInput): DerivedFlags {
  const staleConfirmed = hasOverride(input, 'CONFIRM_STALE') || hasFact(input, 'STALE_HUMAN_CONFIRMED');
  const mockConfirmed =
    hasOverride(input, 'CONFIRM_MOCK_CONTAMINATION') || hasFact(input, 'MOCK_CONTAMINATION_HUMAN_CONFIRMED');
  const currentConfirmed = hasOverride(input, 'CONFIRM_CURRENT') || hasFact(input, 'CURRENT_RECORDING');
  const privacyBlocker = hasOverride(input, 'CONFIRM_PRIVACY_BLOCKER') || hasFact(input, 'PRIVACY_BLOCKER');
  const rightsBlocker = hasOverride(input, 'CONFIRM_RIGHTS_BLOCKER') || hasFact(input, 'RIGHTS_BLOCKER');
  const truthRequiresCurrent = input.truthConstraints.mustUseRealProductEvidence;
  return {
    privacyBlocker,
    rightsBlocker,
    staleConfirmed,
    mockConfirmed,
    currentConfirmed,
    noKnownMock: hasOverride(input, 'CONFIRM_NO_KNOWN_OLD_MOCK_CONTAMINATION') || hasFact(input, 'NO_KNOWN_OLD_MOCK'),
    forceAvoid: hasOverride(input, 'FORCE_AVOID'),
    forcePreferred: hasOverride(input, 'FORCE_PREFERRED'),
    productUi: input.visualSemanticSummary.productUiObserved || input.visualSemanticSummary.observationTypes.includes('PRODUCT_UI'),
    navigation:
      input.visualSemanticSummary.navigationObserved || input.visualSemanticSummary.observationTypes.includes('NAVIGATION'),
    contentPanel:
      input.visualSemanticSummary.contentPanelObserved ||
      input.visualSemanticSummary.observationTypes.includes('CONTENT_PANEL'),
    browserChrome:
      input.visualSemanticSummary.browserChromeObserved ||
      input.visualSemanticSummary.observationTypes.includes('BROWSER_CHROME') ||
      hasFact(input, 'BROWSER_CHROME_PRESENT'),
    localhost:
      input.visualSemanticSummary.localhostObserved ||
      input.visualSemanticSummary.observationTypes.includes('LOCALHOST_REFERENCE') ||
      hasFact(input, 'LOCALHOST_PRESENT'),
    emptyState: input.visualSemanticSummary.emptyStateObserved || hasFact(input, 'EMPTY_STATE_LIMITATION'),
    publishOps: input.visualSemanticSummary.publishOperationsPageObserved || hasFact(input, 'PUBLISH_OPS_PAGE'),
    productInfoChat: hasFact(input, 'PRODUCT_INFO_CONVERSATION'),
    oldEmptyHome: hasFact(input, 'OLD_EMPTY_HOME_LIMITATION'),
    truthRequiresCurrent,
    truthHardBlock:
      (staleConfirmed && mockConfirmed && input.truthConstraints.mustNotRepresentMockAsReal) ||
      (staleConfirmed && truthRequiresCurrent && mockConfirmed),
  };
}

export const RULE_IDS = {
  PRIVACY: 'RULE_PRIVACY_HARD_BLOCK',
  RIGHTS: 'RULE_RIGHTS_HARD_BLOCK',
  TRUTH_STALE_MOCK: 'RULE_TRUTH_STALE_MOCK_HARD_BLOCK',
  FRESHNESS_HUMAN: 'RULE_FRESHNESS_HUMAN_CONFIRMATION',
  CHROME_NOT_STALE: 'RULE_BROWSER_CHROME_NOT_STALE',
  LOCALHOST_NOT_FAKE: 'RULE_LOCALHOST_NOT_FAKE_OR_STALE',
  RELEVANCE_PRODUCT_UI: 'RULE_RELEVANCE_CURRENT_PRODUCT_UI',
  EMPTY_STATE: 'RULE_EMPTY_STATE_LIMITS_EVIDENCE',
  PUBLISH_CLAIM: 'RULE_PUBLISH_PAGE_NOT_VALIDATED_AUTO_PUBLISH',
  OVERRIDE_CANNOT_BYPASS: 'RULE_OVERRIDE_CANNOT_BYPASS_HARD_BLOCK',
} as const;

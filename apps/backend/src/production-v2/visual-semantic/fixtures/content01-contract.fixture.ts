import { CONTENT_01_NEW_RECORDING_EXPECTED_CATEGORIES, CONTENT_01_OLD_RECORDING_EXPECTED_CATEGORIES } from '../content01-semantic-expectation.fixture.js';
import type { ProviderAuthenticityType, VisualSemanticObservationType } from '../contracts/index.js';

export const CONTENT_01_NEW_CONTRACT_FIXTURE = {
  kind: 'EXPECTED_CATEGORY_ONLY' as const,
  measuredVisionOutput: false,
  categories: CONTENT_01_NEW_RECORDING_EXPECTED_CATEGORIES,
  representableAs: ['PRODUCT_UI', 'BROWSER_CHROME', 'NAVIGATION', 'TEXT_REGION'] satisfies VisualSemanticObservationType[],
  uiFocusRepresentable: true,
};

export const CONTENT_01_OLD_CONTRACT_FIXTURE = {
  kind: 'EXPECTED_CATEGORY_ONLY' as const,
  measuredVisionOutput: false,
  categories: CONTENT_01_OLD_RECORDING_EXPECTED_CATEGORIES,
  representableAs: ['PRODUCT_UI', 'TEXT_REGION', 'DEVELOPER_ARTIFACT', 'LOCALHOST_REFERENCE'] satisfies VisualSemanticObservationType[],
  authenticityCandidate: 'STALE_CANDIDATE' satisfies ProviderAuthenticityType,
  forbids: ['STALE', 'DO_NOT_USE', 'CONFIRMED_STALE'] as const,
};

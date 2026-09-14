import { baseResult, fixtureObservation, fixtureRegion, SYNTHETIC_RECT } from './fixture-helpers.js';
import type { VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';

export function productUiFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'product-ui' },
    observations: [
      fixtureObservation('PRODUCT_UI'),
      fixtureObservation('NAVIGATION', { region: { x: 0, y: 0.1, width: 0.2, height: 0.8 } }),
      fixtureObservation('TEXT_REGION', { region: { x: 0.25, y: 0.3, width: 0.5, height: 0.2 } }),
    ],
    semanticRegions: [fixtureRegion('PRODUCT_UI', SYNTHETIC_RECT), fixtureRegion('NAVIGATION', { x: 0, y: 0.1, width: 0.2, height: 0.8 })],
    uiFocusCandidates: [
      {
        region: SYNTHETIC_RECT,
        confidence: 0.91,
        role: 'PRIMARY_CONTENT',
        importanceSignals: ['dense-ui', 'text-cluster'],
      },
    ],
  });
}

export function browserChromeFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'browser-chrome' },
    observations: [
      fixtureObservation('BROWSER_CHROME', {
        region: { x: 0, y: 0, width: 1, height: 0.08 },
        evidence: { frameIds: ['f0'], visualSignals: ['ADDRESS_BAR_LIKE', 'URL_LIKE_TEXT'] },
      }),
    ],
    semanticRegions: [fixtureRegion('BROWSER_CHROME', { x: 0, y: 0, width: 1, height: 0.08 })],
    browserChromeObservations: [
      {
        region: { x: 0, y: 0, width: 1, height: 0.08 },
        confidence: 0.82,
        signals: ['ADDRESS_BAR_LIKE', 'URL_LIKE_TEXT'],
        evidenceFrameIds: ['f0'],
      },
    ],
  });
}

export function productHeaderTrapFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'product-header-trap' },
    observations: [
      fixtureObservation('PRODUCT_UI'),
      fixtureObservation('NAVIGATION', { region: { x: 0, y: 0, width: 1, height: 0.08 } }),
    ],
    semanticRegions: [fixtureRegion('NAVIGATION', { x: 0, y: 0, width: 1, height: 0.08 })],
  });
}

export function developerArtifactFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'developer-artifact' },
    observations: [
      fixtureObservation('LOCALHOST_REFERENCE', {
        evidence: { frameIds: ['f0'], visualSignals: ['localhost-label'], textFragments: [{ text: 'localhost:3000', confidence: 0.8, frameId: 'f0', source: 'VISION_TEXT' }] },
      }),
      fixtureObservation('DEVELOPER_ARTIFACT'),
      fixtureObservation('TERMINAL', { region: { x: 0.05, y: 0.4, width: 0.9, height: 0.5 } }),
    ],
    developerArtifactObservations: [
      {
        type: 'LOCALHOST',
        confidence: 0.84,
        evidence: { frameIds: ['f0'], visualSignals: ['localhost-label'] },
      },
      {
        type: 'DEV_LABEL',
        confidence: 0.7,
        evidence: { frameIds: ['f0'], visualSignals: ['dev'] },
      },
      {
        type: 'TERMINAL',
        confidence: 0.8,
        region: { x: 0.05, y: 0.4, width: 0.9, height: 0.5 },
        evidence: { frameIds: ['f0'], visualSignals: ['terminal-chrome'] },
      },
    ],
  });
}

export function privacyFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'privacy' },
    observations: [fixtureObservation('PRIVACY_SENSITIVE', { region: { x: 0.2, y: 0.2, width: 0.3, height: 0.1 } })],
    privacyObservations: [
      {
        category: 'EMAIL',
        region: { x: 0.2, y: 0.2, width: 0.3, height: 0.1 },
        confidence: 0.77,
        severity: 'HIGH',
      },
      {
        category: 'TOKEN_LIKE',
        region: { x: 0.2, y: 0.35, width: 0.4, height: 0.08 },
        confidence: 0.66,
        severity: 'CRITICAL',
      },
    ],
    textEvidence: [
      { text: 'example@example.com', confidence: 0.77, frameId: 'f0', source: 'VISION_TEXT', region: { x: 0.2, y: 0.2, width: 0.3, height: 0.1 } },
      { text: 'sk_test_fake_token_pattern', confidence: 0.66, frameId: 'f0', source: 'VISION_TEXT' },
    ],
  });
}

export function ambiguousFixture(): VisualSemanticProviderResult {
  return baseResult({
    rawMetadata: { fixtureId: 'ambiguous' },
    observations: [
      fixtureObservation('UNKNOWN_STRUCTURED_REGION', {
        confidence: 0.31,
        uncertainty: { level: 'HIGH', reasons: ['low-contrast-structure'] },
        observationState: 'UNCERTAIN',
      }),
    ],
    semanticRegions: [
      {
        regionId: 'reg:unknown',
        type: 'UNKNOWN_STRUCTURED_REGION',
        rect: SYNTHETIC_RECT,
        confidence: 0.31,
        attributes: { state: 'UNCERTAIN' },
        source: 'MOCK_PROVIDER',
      },
    ],
  });
}

export function partialFixture(): VisualSemanticProviderResult {
  const ui = productUiFixture();
  return {
    ...ui,
    status: 'PARTIAL',
    rawMetadata: { fixtureId: 'partial-privacy-fail' },
    warnings: ['MODULE_ANALYSIS_PARTIAL'],
    moduleResults: [
      { module: 'UI_STRUCTURE', status: 'READY', warnings: [] },
      { module: 'PRIVACY', status: 'FAILED', warnings: ['MODULE_ANALYSIS_PARTIAL'] },
    ],
  };
}

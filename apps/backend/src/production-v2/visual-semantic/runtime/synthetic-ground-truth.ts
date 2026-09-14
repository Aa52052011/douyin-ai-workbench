import type { VisualSemanticObservationType } from '../contracts/observation.types.js';
import type { VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';

export const SYNTHETIC_EXPECTED_TYPES: VisualSemanticObservationType[] = [
  'PRODUCT_UI',
  'NAVIGATION',
  'CONTENT_PANEL',
  'BUTTON_LIKE_REGION',
];

export const SYNTHETIC_OPTIONAL_TYPES: VisualSemanticObservationType[] = [
  'TEXT_REGION',
  'CARD',
  'TABLE',
  'UNKNOWN_STRUCTURED_REGION',
];

export const SYNTHETIC_FORBIDDEN_TYPES: VisualSemanticObservationType[] = [
  'BROWSER_CHROME',
  'OS_CHROME',
  'APP_WINDOW_CHROME',
  'PRIVACY_SENSITIVE',
  'DEVELOPER_ARTIFACT',
];

export type SemanticGroundTruthResult = {
  expectedDetected: VisualSemanticObservationType[];
  expectedMissed: VisualSemanticObservationType[];
  forbiddenFalsePositives: VisualSemanticObservationType[];
  unexpectedObservations: VisualSemanticObservationType[];
  browserChromeFalsePositive: boolean;
  nativeTextObserved: boolean;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
};

export function evaluateSyntheticGroundTruth(result: VisualSemanticProviderResult): SemanticGroundTruthResult {
  const types = new Set(result.observations.map((item) => item.type));
  if ((result.browserChromeObservations?.length ?? 0) > 0) {
    types.add('BROWSER_CHROME');
  }
  const expectedDetected = SYNTHETIC_EXPECTED_TYPES.filter((type) => types.has(type));
  const expectedMissed = SYNTHETIC_EXPECTED_TYPES.filter((type) => !types.has(type));
  const forbiddenFalsePositives = SYNTHETIC_FORBIDDEN_TYPES.filter((type) => types.has(type));
  const allowed = new Set<VisualSemanticObservationType>([...SYNTHETIC_EXPECTED_TYPES, ...SYNTHETIC_OPTIONAL_TYPES, ...SYNTHETIC_FORBIDDEN_TYPES]);
  const unexpectedObservations = [...types].filter((type) => !allowed.has(type));
  const browserChromeFalsePositive = forbiddenFalsePositives.includes('BROWSER_CHROME');
  const nativeTextObserved = result.observations.some(
    (item) =>
      item.type === 'TEXT_REGION' ||
      (item.evidence.textFragments?.length ?? 0) > 0 ||
      (item.evidence.visualSignals ?? []).some((signal) => /workbench|content|script|start|example/i.test(signal)),
  ) || (result.textEvidence?.length ?? 0) > 0;

  let status: SemanticGroundTruthResult['status'] = 'FAIL';
  if (browserChromeFalsePositive || expectedDetected.length < 2) {
    status = 'FAIL';
  } else if (forbiddenFalsePositives.length === 0 && expectedDetected.length >= 3) {
    status = 'PASS';
  } else if (expectedDetected.length >= 2 && !browserChromeFalsePositive) {
    status = 'PARTIAL';
  }

  return {
    expectedDetected,
    expectedMissed,
    forbiddenFalsePositives,
    unexpectedObservations,
    browserChromeFalsePositive,
    nativeTextObserved,
    status,
  };
}

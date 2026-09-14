/**
 * Content #1 semantic expectation fixture.
 * Categories only — not a fabricated Vision output.
 */
export const CONTENT_01_NEW_RECORDING_EXPECTED_CATEGORIES = [
  'PRODUCT_UI',
  'BROWSER_CHROME',
  'NAVIGATION',
  'TEXT_REGION',
  'UI_FOCUS',
] as const;

export const CONTENT_01_OLD_RECORDING_EXPECTED_CATEGORIES = [
  'PRODUCT_UI',
  'TEXT_REGION',
  'DEVELOPER_ARTIFACT',
  'LOCALHOST_REFERENCE',
  'STALE_CANDIDATE',
] as const;

export const CONTENT_01_OLD_ASSET_PROTECTION = {
  evenIfB1GeometryGood: true,
  ifProjectRelevance: 'LOW',
  andStaleness: 'HIGH',
  thenUsageAssessment: 'DO_NOT_USE',
  reason: 'B2 Layer C exists so geometry-good stale assets are not treated as evidence',
} as const;

export const CONTENT_01_NO_HALLUCINATED_CAPABILITY = {
  rule: 'UI label 一键发布 does not imply verified auto-publish',
  claimSupportMustStay: ['NOT_SUPPORTED', 'UNKNOWN', 'PARTIALLY_SUPPORTED'],
  forbiddenAutoJudgment: '已验证自动发布',
} as const;

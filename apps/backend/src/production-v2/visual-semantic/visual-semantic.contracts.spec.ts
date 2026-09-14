import { describe, expect, it } from 'vitest';
import { FRAME_USE } from '../visual/frame/frame-analysis-config.js';
import {
  ASSET_USAGE,
  AUTHENTICITY_TYPES,
  CLAIM_SUPPORT,
  CONFLICT_RESOLUTIONS,
  DO_NOT_USE_REASONS,
  HARD_BLOCK_CODES,
  HUMAN_OVERRIDE_ACTIONS,
  HUMAN_OVERRIDE_SCOPE,
  HYBRID_PRECEDENCE,
  LIMITED_REASONS,
  PRIVACY_CATEGORIES,
  PROJECT_RELEVANCE,
  SEMANTIC_CROP_STRATEGIES,
  TRUTH_LABELS,
  VISUAL_ANALYSIS_STATUS,
  VISUAL_ANALYSIS_WARNINGS,
  VISUAL_SEMANTIC_OBSERVATION_TYPES,
  VISUAL_SEMANTIC_PROMPT_MODULES,
  WATERMARK_TYPES,
  deriveHybridStatus,
} from './contracts/index.js';
import {
  CONTENT_01_NEW_RECORDING_EXPECTED_CATEGORIES,
  CONTENT_01_NO_HALLUCINATED_CAPABILITY,
  CONTENT_01_OLD_ASSET_PROTECTION,
} from './content01-semantic-expectation.fixture.js';
import { CONFLICT_SCENARIOS, LOW_CONFIDENCE_SCENARIOS } from './conflict-scenarios.fixture.js';

describe('B2 visual semantic contracts', () => {
  it('freezes observation types without director actions', () => {
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain('PRODUCT_UI');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain('BROWSER_CHROME');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain('OS_CHROME');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain('APP_WINDOW_CHROME');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).not.toContain('CUT');
    expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).not.toContain('PLACE_SHOT');
  });

  it('forbids REAL/FAKE truth labels on the vision analyzer', () => {
    expect(TRUTH_LABELS).toEqual(['LIKELY_REAL', 'LIKELY_MOCK', 'UNCERTAIN']);
    expect(AUTHENTICITY_TYPES).toEqual(['STALE', 'MOCK', 'DEMO', 'PLACEHOLDER', 'UNRELATED']);
  });

  it('keeps usage as assessment not final shot decision', () => {
    expect(ASSET_USAGE).toContain('DO_NOT_USE');
    expect(DO_NOT_USE_REASONS).toContain('CONFIRMED_PRIVACY_VIOLATION');
    expect(LIMITED_REASONS).toContain('BROWSER_CHROME');
  });

  it('derives PARTIAL when B1 ready and semantic unavailable', () => {
    expect(
      deriveHybridStatus({
        deterministicStatus: 'READY',
        semanticStatus: 'UNAVAILABLE',
        contextStatus: 'UNAVAILABLE',
      }),
    ).toBe('PARTIAL');
  });

  it('derives READY only when B1 + semantic + context are ready', () => {
    expect(
      deriveHybridStatus({
        deterministicStatus: 'READY',
        semanticStatus: 'READY',
        contextStatus: 'READY',
      }),
    ).toBe('READY');
  });

  it('freezes hybrid precedence order', () => {
    expect(HYBRID_PRECEDENCE).toEqual([
      'SAFETY_PRIVACY_RIGHTS',
      'TRUTH',
      'PROJECT_RELEVANCE',
      'EVIDENCE',
      'MUST_KEEP',
      'READABILITY',
      'GEOMETRY',
      'CREATIVE_PREFERENCE',
    ]);
  });

  it('separates semantic frame extract from statistics frames', () => {
    expect(FRAME_USE.SEMANTIC_FRAME_EXTRACT).toBe('SEMANTIC_FRAME_EXTRACT');
    expect(FRAME_USE.ANALYSIS_FRAME_SAMPLE).toBe('ANALYSIS_FRAME_SAMPLE');
  });

  it('allows unknown/uncertain/not-observed tokens via status and relevance', () => {
    expect(PROJECT_RELEVANCE).toContain('UNKNOWN');
    expect(CLAIM_SUPPORT).toContain('UNKNOWN');
    expect(VISUAL_ANALYSIS_STATUS).toContain('PARTIAL');
  });

  it('keeps privacy watermark crop and override enumerations', () => {
    expect(PRIVACY_CATEGORIES).toContain('TOKEN_LIKE');
    expect(WATERMARK_TYPES).toContain('PLATFORM');
    expect(SEMANTIC_CROP_STRATEGIES).toEqual(['SUBJECT', 'UI_FOCUS', 'SAFE_REGION', 'CUSTOM']);
    expect(HUMAN_OVERRIDE_SCOPE).toEqual(['ASSET', 'PROJECT', 'SHOT']);
    expect(HUMAN_OVERRIDE_ACTIONS).toContain('THIS_IS_PRODUCT_UI');
    expect(HARD_BLOCK_CODES).toContain('CONFIRMED_PRIVACY_RISK');
    expect(VISUAL_ANALYSIS_WARNINGS).toContain('SEMANTIC_ANALYSIS_UNAVAILABLE');
    expect(CONFLICT_RESOLUTIONS).toContain('ESCALATE_HUMAN');
    expect(VISUAL_SEMANTIC_PROMPT_MODULES).toContain('UI_STRUCTURE');
  });

  it('describes Content #1 expectations without fake vision payloads', () => {
    expect(CONTENT_01_NEW_RECORDING_EXPECTED_CATEGORIES).toContain('PRODUCT_UI');
    expect(CONTENT_01_OLD_ASSET_PROTECTION.thenUsageAssessment).toBe('DO_NOT_USE');
    expect(CONTENT_01_NO_HALLUCINATED_CAPABILITY.forbiddenAutoJudgment).toBe('已验证自动发布');
  });

  it('freezes eight conflict scenarios and low-confidence fallbacks', () => {
    expect(CONFLICT_SCENARIOS.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(LOW_CONFIDENCE_SCENARIOS).toHaveLength(6);
  });
});

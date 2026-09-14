import { describe, expect, it } from 'vitest';
import { CATALOG_VISION_CANDIDATES } from './candidate-matrix.js';
import {
  B2_3A_CAPABILITY_INPUTS,
  VISION_PROVIDER_CAPABILITY_DECISION,
  canBePreferredForSmokeTest,
  candidateRejectedForMissingImageInput,
  decideProviderSelectionStatus,
  scoreVisionCandidate,
} from './decision.js';
import { EXISTING_PROVIDER_CAPABILITY_MAP } from './existing-client-capability.js';
import { FIRST_SMOKE_TEST_CONTRACT } from './smoke-and-audit.js';

describe('B2-3A vision provider capability validation', () => {
  it('maps router documented + model documented to READY_FOR_SMOKE_TEST', () => {
    expect(
      decideProviderSelectionStatus({
        routerMultimodal: 'DOCUMENTED',
        modelImageInput: 'DOCUMENTED',
        payloadFormatDetermined: true,
        structuredOutputFallback: 'DOCUMENTED',
        newVendorRequired: false,
      }),
    ).toBe('READY_FOR_SMOKE_TEST');
    expect(decideProviderSelectionStatus(B2_3A_CAPABILITY_INPUTS)).toBe('READY_FOR_SMOKE_TEST');
    expect(VISION_PROVIDER_CAPABILITY_DECISION.providerSelectionStatus).toBe('READY_FOR_SMOKE_TEST');
  });

  it('blocks when router multimodal is only INFERRED even if the model is documented', () => {
    expect(
      decideProviderSelectionStatus({
        routerMultimodal: 'INFERRED',
        modelImageInput: 'DOCUMENTED',
        payloadFormatDetermined: true,
        structuredOutputFallback: 'DOCUMENTED',
        newVendorRequired: false,
      }),
    ).toBe('BLOCKED_BY_CAPABILITY_UNKNOWN');
  });

  it('blocks when router is documented but the model image capability is unknown', () => {
    expect(
      decideProviderSelectionStatus({
        routerMultimodal: 'DOCUMENTED',
        modelImageInput: 'UNVALIDATED',
        payloadFormatDetermined: true,
        structuredOutputFallback: 'DOCUMENTED',
        newVendorRequired: false,
      }),
    ).toBe('BLOCKED_BY_CAPABILITY_UNKNOWN');
  });

  it('rejects candidates whose image input is missing or unsupported', () => {
    expect(candidateRejectedForMissingImageInput('UNVALIDATED')).toBe(true);
    expect(candidateRejectedForMissingImageInput('NOT_SUPPORTED')).toBe(true);
    expect(candidateRejectedForMissingImageInput('DOCUMENTED')).toBe(false);
    expect(canBePreferredForSmokeTest('UNVALIDATED')).toBe(false);
    expect(canBePreferredForSmokeTest('DOCUMENTED')).toBe(true);
  });

  it('does not mark router multimodal as NOT_SUPPORTED when docs only omit a runtime call', () => {
    expect(
      decideProviderSelectionStatus({
        routerMultimodal: 'NOT_SUPPORTED',
        modelImageInput: 'DOCUMENTED',
        payloadFormatDetermined: true,
        structuredOutputFallback: 'DOCUMENTED',
        newVendorRequired: false,
      }),
    ).toBe('ROUTER_MULTIMODAL_NOT_SUPPORTED');
  });

  it('keeps text client string-only and smoke contract single synthetic UI_STRUCTURE', () => {
    expect(EXISTING_PROVIDER_CAPABILITY_MAP.multimodalContentParts.supported).toBe(false);
    expect(EXISTING_PROVIDER_CAPABILITY_MAP.jsonObject.supported).toBe(true);
    expect(EXISTING_PROVIDER_CAPABILITY_MAP.jsonSchema.supported).toBe(false);
    expect(FIRST_SMOKE_TEST_CONTRACT.imageCount).toBe(1);
    expect(FIRST_SMOKE_TEST_CONTRACT.modules).toEqual(['UI_STRUCTURE']);
    expect(FIRST_SMOKE_TEST_CONTRACT.forbiddenSources).toContain('CONTENT_01_FRAMES');
  });

  it('scores Chinese UI and grounding conservatively without fake 5/5', () => {
    const primary = CATALOG_VISION_CANDIDATES.find((row) => row.modelId === 'openai/gpt-5.5');
    expect(primary).toBeDefined();
    const scored = scoreVisionCandidate(primary!, { latencyScore: 2, stabilityScore: 4 });
    expect(scored.breakdown.chineseUi).toBeLessThanOrEqual(2);
    expect(scored.breakdown.regionGrounding).toBeLessThanOrEqual(1);
    expect(scored.eligiblePreferred).toBe(true);
    expect(VISION_PROVIDER_CAPABILITY_DECISION.preferredSmokeCandidate).toBe('openai/gpt-5.5');
    expect(VISION_PROVIDER_CAPABILITY_DECISION.backupSmokeCandidate).toBe('anthropic/claude-haiku-4.5');
  });

  it('lists at most three primary-family plus two backup-family catalog vision candidates', () => {
    const preferredAndCandidates = CATALOG_VISION_CANDIDATES.filter(
      (row) => row.status === 'PREFERRED_FOR_SMOKE_TEST' || row.status === 'CANDIDATE',
    );
    const backups = CATALOG_VISION_CANDIDATES.filter((row) => row.status === 'BACKUP_FOR_SMOKE_TEST');
    expect(preferredAndCandidates.length).toBeLessThanOrEqual(3);
    expect(backups.length).toBeLessThanOrEqual(2);
    expect(CATALOG_VISION_CANDIDATES.every((row) => row.imageInput === 'DOCUMENTED')).toBe(true);
  });
});

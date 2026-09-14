import { describe, expect, it } from 'vitest';
import {
  BLUR_SOURCE_CONFIG,
  FROZEN_TOP_TRIM_CROP,
  PLACEHOLDER_CONFIG,
  SOLID_BLACK_CONFIG,
  backgroundConfigForSession,
  isPreviewOfPreviewPath,
  previewConfigHash,
  previewMatchesSelectedBackground,
} from './preview-config.js';
import { bumpPreviewVersion, approveButton } from './review-http-view.js';
import type { PersistedReviewSession } from './persistence.types.js';
import { CROP_REVIEW_PERSISTENCE_VERSION } from './persistence.types.js';

function session(over: Partial<PersistedReviewSession> = {}): PersistedReviewSession {
  return {
    schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
    id: 's1',
    tenantId: 't',
    workspaceId: 'w',
    projectId: 'p',
    assetId: 'a',
    candidateId: 'crop:top-trim',
    candidateVersion: 'geom:crop:top-trim',
    reviewPacketVersion: 'crop.human-review-packet:v1',
    previewId: 'pv:x',
    previewVersion: 'preview:runtime-1',
    status: 'READY_FOR_REVIEW',
    backgroundTreatment: 'SOLID',
    requiredWarningsJson: [],
    checklistJson: [
      { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'PRODUCT_UI_READABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
    ],
    humanDecision: 'NOT_REVIEWED',
    createdByUserId: null,
    reviewedByUserId: null,
    expiresAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('preview runtime contracts', () => {
  it('binds frozen geometry 1920x930@(0,110)', () => {
    expect(FROZEN_TOP_TRIM_CROP).toEqual({ x: 0, y: 110, width: 1920, height: 930 });
  });

  it('changes config hash when background changes', () => {
    const solid = previewConfigHash({
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      background: SOLID_BLACK_CONFIG,
    });
    const blur = previewConfigHash({
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      background: BLUR_SOURCE_CONFIG,
    });
    const placeholder = previewConfigHash({
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      background: PLACEHOLDER_CONFIG,
    });
    expect(solid).not.toBe(blur);
    expect(solid).not.toBe(placeholder);
    expect(bumpPreviewVersion('preview:runtime-1')).toBe('preview:runtime-2');
  });

  it('rejects preview-of-preview paths', () => {
    expect(isPreviewOfPreviewPath('/tmp/review-preview/s/v.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('D:\\x\\.local\\crop-review-previews\\t\\s\\v.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('D:\\x\\.local\\editorial-shot-previews\\t\\s\\v.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/media/assets/803fafd2.mp4')).toBe(false);
  });

  it('does not implement DUPLICATE_BLUR / AI_GENERATED; STATIC_IMAGE requires asset', () => {
    expect(backgroundConfigForSession('DUPLICATE_BLUR')).toEqual({ error: 'ALIAS_NOT_IMPLEMENTED' });
    expect(backgroundConfigForSession('AI_GENERATED')).toEqual({ error: 'BACKGROUND_UNSUPPORTED' });
    expect(backgroundConfigForSession('STATIC_IMAGE')).toEqual({ error: 'BACKGROUND_ASSET_REQUIRED' });
    expect(backgroundConfigForSession('SOLID')).toEqual({ error: 'SOLID_COLOR_REQUIRED' });
    expect(backgroundConfigForSession('SOLID', { solidColor: '#000000' })).toEqual(SOLID_BLACK_CONFIG);
    expect(backgroundConfigForSession('UNRESOLVED')).toEqual(PLACEHOLDER_CONFIG);
    expect(backgroundConfigForSession('BLUR_SOURCE')).toEqual(BLUR_SOURCE_CONFIG);
  });

  it('placeholder preview cannot satisfy final background approval', () => {
    expect(
      previewMatchesSelectedBackground(
        { backgroundTreatment: 'UNRESOLVED', backgroundMode: 'SMOKE_PLACEHOLDER_SOLID_BLACK', backgroundApprovalEligible: false },
        'SOLID',
      ),
    ).toBe(false);
    const gate = approveButton(session({ backgroundTreatment: 'SOLID' }), {
      status: 'READY',
      failureCode: null,
      placeholder: true,
      backgroundApprovalEligible: false,
    });
    expect(gate.enabled).toBe(false);
    expect(gate.reasons).toContain('PLACEHOLDER_BACKGROUND_NOT_APPROVABLE');
  });

  it('missing artifact blocks approve', () => {
    const gate = approveButton(session(), {
      status: 'MISSING_ARTIFACT',
      failureCode: 'PREVIEW_ARTIFACT_MISSING',
      placeholder: false,
      backgroundApprovalEligible: false,
    });
    expect(gate.enabled).toBe(false);
    expect(gate.reasons).toContain('PREVIEW_ARTIFACT_MISSING');
  });

  it('session BLUR_SOURCE vs SOLID preview is a mismatch', () => {
    expect(
      previewMatchesSelectedBackground({ backgroundTreatment: 'SOLID', backgroundMode: 'SOLID' }, 'BLUR_SOURCE'),
    ).toBe(false);
  });
});

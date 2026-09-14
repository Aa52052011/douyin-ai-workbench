import { describe, expect, it } from 'vitest';
import { FROZEN_SPEC_HASH_V2 } from './final-production-v2-authorization.js';
import { productionConstraintRegistry } from './production-constraints.js';
import {
  ACCEPTED_LANDSCAPE_SHA_V2,
  ACCEPTED_VERTICAL_SHA_V2,
  acceptanceStaleIfShaChanges,
  auditDouyinPublishCapability,
  buildFinalProductionAcceptanceV2,
  publicationAuthorizationContract,
  publicationCopyDraft,
  publicationReadinessMatrix,
  publicationTruthGate,
  recommendedPublicationNextStep,
} from './publication-acceptance.js';

describe('B2-15O4 final acceptance and publication gate', () => {
  it('persists explicit acceptance bound to exact hashes and does not grant publication', () => {
    const acc = buildFinalProductionAcceptanceV2();
    expect(acc.decision).toBe('ACCEPTED');
    expect(acc.source).toBe('EXPLICIT_USER_MESSAGE');
    expect(acc.specificationHash).toBe(FROZEN_SPEC_HASH_V2);
    expect(acc.verticalSHA256).toBe(ACCEPTED_VERTICAL_SHA_V2);
    expect(acc.landscapeSHA256).toBe(ACCEPTED_LANDSCAPE_SHA_V2);
    expect(acc.doesNotEqual).toBe('PUBLICATION_AUTHORIZATION');
    expect(publicationAuthorizationContract().thisStepCreatesInstance).toBe(false);
    expect(acceptanceStaleIfShaChanges(ACCEPTED_VERTICAL_SHA_V2, ACCEPTED_LANDSCAPE_SHA_V2)).toBe(false);
    expect(acceptanceStaleIfShaChanges('dead', ACCEPTED_LANDSCAPE_SHA_V2)).toBe(true);
    expect(productionConstraintRegistry().constraints).toHaveLength(24);
  });

  it('audits Douyin as manual-export-only and keeps C5/C6 on publication draft', () => {
    const audit = auditDouyinPublishCapability({ oauthConfigured: false, douyinAccountCount: 0, douyinActiveAccountCount: 0 });
    expect(audit.publishMode).toBe('MANUAL_EXPORT_ONLY');
    expect(audit.publishProviderImplemented).toBe(false);
    expect(recommendedPublicationNextStep(audit)).toBe('IMPLEMENT_DOUYIN_PUBLISH_PROVIDER');
    expect(publicationReadinessMatrix(audit).FINAL_VIDEO_ACCEPTED).toBe('READY');
    expect(publicationReadinessMatrix(audit).PUBLICATION_AUTHORIZATION).toBe('BLOCKED_HUMAN_APPROVAL');
    const draft = publicationCopyDraft();
    expect(draft.status).toBe('DRAFT');
    expect(draft.autoApproved).toBe(false);
    expect(draft.llmCalls).toBe(0);
    expect(draft.caption).toContain('手动发布');
    expect(draft.caption).not.toMatch(/保证爆款/);
    const truth = publicationTruthGate(draft);
    expect(truth.C5).toBe('RESTRICTED');
    expect(truth.C6).toBe('RESTRICTED');
    expect(truth.status).toBe('PASS_WITH_RESTRICTIONS');
  });
});

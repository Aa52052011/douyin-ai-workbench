import { describe, expect, it } from 'vitest';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { FROZEN_SCRIPT_ID, SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';
import { FROZEN_PRODUCTION_AUTHORIZATION_ID } from '../source-aware-output/production-render.js';
import { SCRIPT_TIMELINE_AUTHORITY } from './director-v1.js';
import { O2G_OPENING_ZOOMPAN_EXPR } from './motion-stability.js';
import { REJECTED_SECTION4_CANDIDATE } from './visual-governance.js';
import {
  CALIBRATION_AS_PRODUCTION_SOURCE,
  approvedCalibrationMerge,
  assertSpecReadyForFreeze,
  audioPolicyV2,
  authorizationRequirement,
  bgmContentDecisionFinal,
  buildFinalProductionSpecificationV2,
  finalConstraintReconciliation,
  landscapeProfileV2,
  productionReadinessMatrix,
  sha256Canonical,
  verticalProfileV2,
} from './final-production-spec-v2.js';

describe('B2-15O2I FinalProductionSpecificationV2', () => {
  const spec = buildFinalProductionSpecificationV2();

  it('freezes original-source spec with merged calibrations and 24 constraints', () => {
    expect(assertSpecReadyForFreeze(spec)).toBe(true);
    expect(spec.specificationId).toBe('spec:content-01:final-production:v2');
    expect(spec.status).toBe('FROZEN_V2');
    expect(spec.sourceAssetId).toBe(CONTENT_01_NEW_ASSET_ID);
    expect(spec.scriptId).toBe(FROZEN_SCRIPT_ID);
    expect(spec.timelineAuthority).toBe(SCRIPT_TIMELINE_AUTHORITY);
    expect(spec.plannedDurationMs).toBe(45_677);
    expect(spec.calibrationArtifactAsProductionSource).toBe(CALIBRATION_AS_PRODUCTION_SOURCE);
    expect(spec.finalProductionAcceptance).toBe('REQUEST_CHANGES');
    expect(approvedCalibrationMerge().items).toHaveLength(5);
    expect(approvedCalibrationMerge().items.every((i) => i.status === 'HUMAN_ACCEPTED')).toBe(true);
    const recon = finalConstraintReconciliation();
    expect(recon.totalConstraints).toBe(24);
    expect(recon.missing).toEqual([]);
    expect(recon.conflicts).toEqual([]);
    expect(recon.violations).toBe(0);
    expect(sha256Canonical(spec)).toHaveLength(64);
  });

  it('preserves V2, opening static hold, section4, landscape, BGM optional, and stale v1 auth', () => {
    expect(SELECTED_V2_SHARPEN).toBe('unsharp=5:5:0.35:3:3:0.0');
    expect(verticalProfileV2().fidelity).toBe('V2_LIGHT_SHARPEN_SELECTED');
    expect(spec.motionPolicies.opening.kenBurns).toBe('FORBIDDEN');
    expect(spec.motionPolicies.opening.kenBurnsExpr).toBe(O2G_OPENING_ZOOMPAN_EXPR);
    expect(spec.motionPolicies.opening.fixedScale).toBe(1);
    expect(landscapeProfileV2().framing).toBe('SOURCE_NATIVE_NO_STRETCH');
    expect(spec.aiImagePolicy.rejected).toBe(REJECTED_SECTION4_CANDIDATE);
    expect(audioPolicyV2().regenerateTts).toBe(false);
    const bgm = bgmContentDecisionFinal();
    expect(bgm.content01Decision).toBe('OPTIONAL');
    expect(bgm.basis).toBe('DIRECTOR_CONTENT_DECISION_ALLOWING_NARRATION_ONLY');
    expect(bgm.notBasis).toBe('MINIMAX_PROVIDER_FAILURE');
    expect(spec.noQualityDowngrade).toBe('ACTIVE');
    const auth = authorizationRequirement();
    expect(auth.oldAuthorizationId).toBe(FROZEN_PRODUCTION_AUTHORIZATION_ID);
    expect(auth.oldAuthorizationValidForV2).toBe(false);
    expect(auth.newFinalProductionAuthorization).toBe('REQUIRED');
    expect(auth.thisStep).toBe('DO_NOT_CREATE_AUTHORIZATION');
    expect(productionReadinessMatrix().TIMELINE).toBe('READY_FOR_FINAL_RENDER');
    expect(spec.digitalHumanPolicy.identity).toBe('USER_SELF_FIRST');
  });
});

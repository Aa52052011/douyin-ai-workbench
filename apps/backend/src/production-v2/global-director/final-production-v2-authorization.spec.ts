import { describe, expect, it } from 'vitest';
import { FROZEN_PRODUCTION_AUTHORIZATION_ID } from '../source-aware-output/production-render.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { O2G_OPENING_ZOOMPAN_EXPR } from './motion-stability.js';
import { buildScreenshotStaticHoldFilter } from './motion-stability.js';
import {
  FINAL_PRODUCTION_AUTHORIZATION_V2_ID,
  FROZEN_SPEC_HASH_V2,
  assertOriginalProductionSourcePath,
  consumeAuthorizationBindings,
  createFinalProductionAuthorizationV2,
  liveBindingHashes,
  productionExecutionPlanV2,
} from './final-production-v2-authorization.js';

describe('B2-15O3 final production authorization v2', () => {
  it('binds exact O2I hashes and refuses old authorization reuse', () => {
    const live = liveBindingHashes();
    expect(live.specificationHash).toBe(FROZEN_SPEC_HASH_V2);
    expect(() => consumeAuthorizationBindings(live)).not.toThrow();
    const auth = createFinalProductionAuthorizationV2();
    expect(auth.authorizationId).toBe(FINAL_PRODUCTION_AUTHORIZATION_V2_ID);
    expect(auth.authorizationId).not.toBe(FROZEN_PRODUCTION_AUTHORIZATION_ID);
    expect(auth.oldAuthorizationValidForV2).toBe(false);
    expect(auth.source).toBe('EXPLICIT_USER_MESSAGE');
    expect(auth.sourceAssetId).toBe(CONTENT_01_NEW_ASSET_ID);
    expect(productionExecutionPlanV2().overwriteV1).toBe(false);
    expect(() =>
      consumeAuthorizationBindings({ ...live, specificationHash: 'deadbeef' }),
    ).toThrow(/AUTHORIZATION_STALE_OR_MISMATCH/);
  });

  it('forbids calibration sources and Ken Burns opening filter', () => {
    expect(() => assertOriginalProductionSourcePath('/tmp/b2-15o2g/calibration/FullTimeline_Vertical_Calibration.mp4')).toThrow(
      /CALIBRATION/,
    );
    const hold = buildScreenshotStaticHoldFilter(1080, 1920, 8.352);
    expect(hold).not.toContain('zoompan');
    expect(hold).not.toContain(O2G_OPENING_ZOOMPAN_EXPR);
  });
});

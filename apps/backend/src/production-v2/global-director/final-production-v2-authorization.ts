import { FROZEN_PRODUCTION_AUTHORIZATION_ID } from '../source-aware-output/production-render.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { FROZEN_SCRIPT_ID } from '../audio-calibration/audio-integration.js';
import {
  FINAL_PRODUCTION_SPEC_ID,
  audioPolicyV2,
  buildFinalProductionSpecificationV2,
  finalConstraintReconciliation,
  landscapeProfileV2,
  sha256Canonical,
  verticalProfileV2,
} from './final-production-spec-v2.js';

/** Frozen at B2-15O2I. Any live drift must STOP as AUTHORIZATION_STALE_OR_MISMATCH. */
export const FROZEN_SPEC_HASH_V2 = '9dbda6b55854f8e6b5c2ca5bf126c75035741b3c81777f3d628c755d4488a6e5';
export const FROZEN_VERTICAL_PROFILE_HASH_V2 = '41450cbc92af4d62140e5592eaceae4c497269b443427b11c0da9bdf29e5556d';
export const FROZEN_LANDSCAPE_PROFILE_HASH_V2 = 'ab1884e5cbfe34edb2dc75a5b1c4a77d1c7d2de328dfb7d61d54a88d7d541251';
export const FROZEN_AUDIO_POLICY_HASH_V2 = '29e25d6fc8b2d283303b881701d515d3d74a6d4d512023752d235a6a2f42a795';
export const FROZEN_CONSTRAINT_SNAPSHOT_HASH_V2 = '7c63f50ebd5d0da72d6fe343fd061dec99b8885165633ef6243598a788e3a65b';

export const FINAL_PRODUCTION_AUTHORIZATION_V2_ID = '9dbda6b5-1503-4000-8c22-7c63f50ebd5d';
export const PRODUCTION_EXECUTION_PLAN_V2_ID = '9dbda6b5-1503-4001-8c22-29e25d6fc8b2';
export const PRODUCTION_SESSION_V2_ID = '01b2151503-final-v2';
export const VERTICAL_ARTIFACT_V2_ID = '9dbda6b5-1503-4a11-8c22-41450cbc92af';
export const LANDSCAPE_ARTIFACT_V2_ID = '9dbda6b5-1503-4a12-8c22-ab1884e5cbfe';
export const FINAL_REVIEW_SESSION_V2_ID = '9dbda6b5-1503-4002-8c22-a401c15e0001';
export const AUTHORIZED_AT_V2 = '2026-09-13T06:03:00.000Z';

export function liveBindingHashes() {
  const spec = buildFinalProductionSpecificationV2();
  const recon = finalConstraintReconciliation();
  const snapshot = {
    names: recon.names,
    count: recon.totalConstraints,
    missing: recon.missing,
    conflicts: recon.conflicts,
    violations: recon.violations,
  };
  return {
    specificationHash: sha256Canonical(spec),
    verticalProfileHash: sha256Canonical(verticalProfileV2()),
    landscapeProfileHash: sha256Canonical(landscapeProfileV2()),
    audioPolicyHash: sha256Canonical(audioPolicyV2()),
    constraintSnapshotHash: sha256Canonical(snapshot),
    sourceAssetId: spec.sourceAssetId,
    scriptId: spec.scriptId,
  };
}

export function createFinalProductionAuthorizationV2() {
  const live = liveBindingHashes();
  consumeAuthorizationBindings(live);
  return {
    schemaVersion: 'final.production-authorization:v2',
    authorizationId: FINAL_PRODUCTION_AUTHORIZATION_V2_ID,
    source: 'EXPLICIT_USER_MESSAGE',
    actor: 'HUMAN_USER',
    specificationId: FINAL_PRODUCTION_SPEC_ID,
    specificationHash: FROZEN_SPEC_HASH_V2,
    verticalProfileHash: FROZEN_VERTICAL_PROFILE_HASH_V2,
    landscapeProfileHash: FROZEN_LANDSCAPE_PROFILE_HASH_V2,
    audioPolicyHash: FROZEN_AUDIO_POLICY_HASH_V2,
    constraintSnapshotHash: FROZEN_CONSTRAINT_SNAPSHOT_HASH_V2,
    sourceAssetId: CONTENT_01_NEW_ASSET_ID,
    scriptId: FROZEN_SCRIPT_ID,
    authorizedAt: AUTHORIZED_AT_V2,
    status: 'ACTIVE' as const,
    grants: 'RENDER_NEW_V2_ARTIFACTS_FROM_FROZEN_SPEC',
    doesNotGrant: ['FINAL_PRODUCTION_HUMAN_ACCEPTANCE', 'PUBLICATION_AUTHORIZATION'],
    oldAuthorizationId: FROZEN_PRODUCTION_AUTHORIZATION_ID,
    oldAuthorizationValidForV2: false,
  };
}

export function consumeAuthorizationBindings(live = liveBindingHashes()): void {
  const expected = {
    specificationHash: FROZEN_SPEC_HASH_V2,
    verticalProfileHash: FROZEN_VERTICAL_PROFILE_HASH_V2,
    landscapeProfileHash: FROZEN_LANDSCAPE_PROFILE_HASH_V2,
    audioPolicyHash: FROZEN_AUDIO_POLICY_HASH_V2,
    constraintSnapshotHash: FROZEN_CONSTRAINT_SNAPSHOT_HASH_V2,
    sourceAssetId: CONTENT_01_NEW_ASSET_ID,
    scriptId: FROZEN_SCRIPT_ID,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (live[key] !== expected[key]) {
      throw new Error(`AUTHORIZATION_STALE_OR_MISMATCH:${key}`);
    }
  }
}

export function assertOriginalProductionSourcePath(filePath: string): void {
  const lower = filePath.replaceAll('\\', '/').toLowerCase();
  if (lower.includes('b2-15o2g') || lower.includes('b2-15o2h') || lower.includes('b2-15o2f')) {
    throw new Error('CALIBRATION_ARTIFACT_AS_PRODUCTION_SOURCE');
  }
  if (lower.includes('/calibration/') || lower.includes('fulltimeline_') || lower.includes('section4_')) {
    throw new Error('CALIBRATION_ARTIFACT_AS_PRODUCTION_SOURCE');
  }
}

export function productionExecutionPlanV2() {
  consumeAuthorizationBindings();
  return {
    schemaVersion: 'production.execution-plan:v2',
    planId: PRODUCTION_EXECUTION_PLAN_V2_ID,
    authorizationId: FINAL_PRODUCTION_AUTHORIZATION_V2_ID,
    specificationId: FINAL_PRODUCTION_SPEC_ID,
    specificationHash: FROZEN_SPEC_HASH_V2,
    sessionId: PRODUCTION_SESSION_V2_ID,
    sourceAssetId: CONTENT_01_NEW_ASSET_ID,
    scriptId: FROZEN_SCRIPT_ID,
    verticalArtifactId: VERTICAL_ARTIFACT_V2_ID,
    landscapeArtifactId: LANDSCAPE_ARTIFACT_V2_ID,
    verticalFileName: 'vertical.douyin.v2.mp4',
    landscapeFileName: 'landscape.ui-demo.v2.mp4',
    overwriteV1: false,
    status: 'AUTHORIZED_TO_RENDER',
  };
}

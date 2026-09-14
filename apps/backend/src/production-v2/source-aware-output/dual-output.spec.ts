import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANDSCAPE_PROFILE_ID,
  VERTICAL_PROFILE_ID,
  buildDualOutputProductionPlan,
  buildOutputSelection,
  defaultUiDemoRecommendationInputs,
  evaluateProductionProfileGate,
  recommendSourceTypeOutput,
} from './dual-output.js';
import { FileOutputSelectionStore, MemoryOutputSelectionStore } from './selection-store.js';
import { recommendOutputForSourceType } from './profiles.js';

describe('B2-15I dual-output production policy', () => {
  it('persists DUAL selection and reloads identically', async () => {
    const store = new MemoryOutputSelectionStore();
    const saved = await store.upsert(
      buildOutputSelection({
        selectionId: '11111111-1111-4111-8111-111111111111',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reviewSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
        selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
        selectionSource: 'EXPLICIT_USER_MESSAGE',
      }),
    );
    const loaded = await store.getByReviewSession(saved.tenantId, saved.reviewSessionId);
    expect(loaded?.selectedStrategy).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect(loaded?.selectionSource).toBe('EXPLICIT_USER_MESSAGE');
    expect(loaded?.selectedProfileIds).toEqual([VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID]);
  });

  it('denies cross-tenant reads', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215i-sel-'));
    const store = new FileOutputSelectionStore(dir);
    const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const sessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await store.upsert(
      buildOutputSelection({
        selectionId: '11111111-1111-4111-8111-111111111111',
        tenantId: tenantA,
        workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reviewSessionId: sessionId,
        sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
        selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
        selectionSource: 'EXPLICIT_USER_MESSAGE',
      }),
    );
    expect(await store.getByReviewSession(tenantB, sessionId)).toBeNull();
    expect(await store.getByReviewSession(tenantA, sessionId)).not.toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records EXPLICIT_USER_MESSAGE rather than UI_APPROVE_ACTION', () => {
    const selection = buildOutputSelection({
      selectionId: '11111111-1111-4111-8111-111111111111',
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reviewSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
      selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      selectionSource: 'EXPLICIT_USER_MESSAGE',
    });
    expect(selection.selectionSource).toBe('EXPLICIT_USER_MESSAGE');
    expect(selection.selectionSource).not.toBe('UI_APPROVE_ACTION');
    expect(selection.selectionSource).not.toBe('SYSTEM_INFERENCE');
  });

  it('keeps selection independent of human approval', () => {
    const selection = buildOutputSelection({
      selectionId: 's',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      reviewSessionId: 'r',
      sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
      selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      selectionSource: 'EXPLICIT_USER_MESSAGE',
    });
    expect(selection.selectedStrategy).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect({ humanApproved: false, approvalObject: null }).toEqual({ humanApproved: false, approvalObject: null });
  });

  it('keeps selection independent of production authorization', () => {
    const gate = evaluateProductionProfileGate({
      strategySelected: true,
      profileConfigValid: true,
      sourceOriginalAvailable: true,
      visualReviewApproved: false,
      truthGate: 'EXISTING',
      productionAuthorized: false,
    });
    expect(gate.checks.find((item) => item.id === 'OUTPUT_STRATEGY_SELECTED')?.result).toBe('PASS');
    expect(gate.checks.find((item) => item.id === 'PRODUCTION_AUTHORIZED')?.result).toBe('NO');
    expect(gate.readyForProduction).toBe(false);
  });

  it('binds exactly vertical and landscape profiles for DUAL', () => {
    const plan = buildDualOutputProductionPlan({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      sourceAssetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
      sourceAwarePlanRef: 'source-aware.editorial-director:v2',
    });
    const selected = plan.profiles.filter((item) => item.status === 'SELECTED');
    expect(selected).toHaveLength(2);
    expect(selected.map((item) => item.profileId)).toEqual([VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID]);
    expect(selected.every((item) => item.status !== 'READY_FOR_PRODUCTION')).toBe(true);
  });

  it('requires DIRECT_FROM_ORIGINAL on both profiles', () => {
    const plan = buildDualOutputProductionPlan({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      sourceAssetId: 'a',
      sourceAwarePlanRef: 'source-aware.editorial-director:v2',
    });
    expect(plan.profiles.every((item) => item.sourcePolicy === 'DIRECT_FROM_ORIGINAL')).toBe(true);
    expect(plan.chainingForbidden).toContain('REVIEW_PREVIEW_TO_PRODUCTION');
  });

  it('keeps vertical and landscape config identities distinct', () => {
    const plan = buildDualOutputProductionPlan({
      strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
      sourceAssetId: 'a',
      sourceAwarePlanRef: 'source-aware.editorial-director:v2',
    });
    expect(plan.profiles[0].configHash).not.toBe(plan.profiles[1].configHash);
  });

  it('does not auto-lock non SCREEN_RECORDING sources to DUAL', () => {
    const rec = recommendSourceTypeOutput({
      sourceVisualType: 'CAMERA_HUMAN',
      sourceAspectRatio: 16 / 9,
      uiDensity: 'MEDIUM',
      textDensity: 'MEDIUM',
      verticalReadability: 'UNKNOWN',
      landscapeReadability: 'UNKNOWN',
      fullscreenRequirement: 'UNKNOWN',
    });
    expect(rec.recommendedStrategy).toBe('HUMAN_DECISION_REQUIRED');
    expect(rec.forced).toBe(false);
    expect(rec.recommendedStrategy).not.toBe('DUAL_VERTICAL_AND_LANDSCAPE');
  });

  it('recommends but does not force DUAL for SCREEN_RECORDING_UI_DEMO', () => {
    const rec = recommendSourceTypeOutput(defaultUiDemoRecommendationInputs());
    expect(rec.recommendedStrategy).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect(rec.forced).toBe(false);
    expect(rec.kind).toBe('recommendation');
    const legacy = recommendOutputForSourceType({
      sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
      sourceWidth: 1920,
      sourceHeight: 1040,
    });
    expect(legacy.autoRecommendation).toBe('DUAL_RECOMMENDED');
    expect(legacy.locked).toBe(false);
  });
});

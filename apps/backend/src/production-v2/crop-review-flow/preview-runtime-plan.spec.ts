import { describe, expect, it } from 'vitest';
import { assembleContent01Clean } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../director-visual-policy/dryrun-assembler.js';
import { buildPreviewExecutionPlan } from '../crop-execution/execution-plan-builder.js';
import {
  PREVIEW_DURATION_TOLERANCE_MS,
  durationWithinTolerance,
  outputIsIsolated,
  retargetFrozenCropToReviewPreview,
} from './preview-runtime-plan.js';

describe('B2-13A review preview retarget', () => {
  it('keeps frozen crop 1920x930 at 0,110 and pads to 720x1280', () => {
    const pack = assembleContent01Clean();
    const generation = generateSemanticCropCandidates(pack);
    const evaluation = evaluateCropComparison(pack, generation);
    const dryRun = runCropSelectionDryRun(evaluation);
    const production = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
    expect(production.crop).toEqual({ x: 0, y: 110, width: 1920, height: 930 });
    const retargeted = retargetFrozenCropToReviewPreview({
      frozenCrop: production.crop!,
      productionPreviewPlan: production,
      sessionId: 'session-content01-b213a',
      previewVersion: 'preview:runtime-1',
      previewId: 'pv:test',
      assetId: production.assetId,
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      expiresAt: '1970-01-04T00:00:00.000Z',
    });
    expect(retargeted.crop).toEqual({ x: 0, y: 110, width: 1920, height: 930 });
    expect(retargeted.scale).toEqual({ width: 720, height: 348 });
    expect(retargeted.pad).toEqual({ width: 720, height: 1280, x: 0, y: 466 });
    expect(retargeted.filterGraph).toBe(
      'crop=1920:930:0:110,scale=720:348:force_original_aspect_ratio=disable,pad=720:1280:0:466:black,setsar=1',
    );
    expect(retargeted.plan.productionUsable).toBe(false);
    expect(retargeted.plan.previewOnly).toBe(true);
    expect(retargeted.plan.backgroundTreatment).toBe('UNRESOLVED');
    expect(durationWithinTolerance(35_000, 35_100)).toBe(true);
    expect(durationWithinTolerance(35_000, 35_400, PREVIEW_DURATION_TOLERANCE_MS)).toBe(false);
    expect(outputIsIsolated('D:/x/b2-13a/runtime-preview/a.mp4', 'D:/x/source.mp4')).toBe(true);
  });
});

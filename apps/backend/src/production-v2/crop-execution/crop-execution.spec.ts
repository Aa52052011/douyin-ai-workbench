import { describe, expect, it } from 'vitest';
import { assembleContent01Clean } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { CONTENT_01_GEOMETRY } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../director-visual-policy/dryrun-assembler.js';
import { buildCropDecisionReview, buildHumanReviewPacket, buildReviewChecklist } from './review-contract.js';
import { validateHumanApprovedCropDecision } from './human-approval-validator.js';
import { buildAuthorizedExecutionPlan, buildPreviewExecutionPlan } from './execution-plan-builder.js';
import { authorizeFromDryRunOnly, validateFFmpegCropExecutionPlan } from './execution-plan-validator.js';
import { buildFFmpegExecutionArgs } from './ffmpeg-args.js';
import { assertNoNonUniformStretch } from './ffmpeg-filter-builder.js';
import { alignEvenPixelCrop, assertPixelCrop, ExecutionGeometryError } from './pixel-align.js';
import { notRunPostExecutionValidation } from './post-execution-validation.js';
import type { HumanApprovedCropDecisionV1 } from './human-approval.types.js';

function content01Pipeline() {
  const pack = assembleContent01Clean();
  const generation = generateSemanticCropCandidates(pack);
  const evaluation = evaluateCropComparison(pack, generation);
  const dryRun = runCropSelectionDryRun(evaluation);
  return { pack, generation, evaluation, dryRun };
}

function syntheticApproval(candidateId: string, source: HumanApprovedCropDecisionV1['approvalSource'], byHuman = true): HumanApprovedCropDecisionV1 {
  return {
    schemaVersion: 'crop.human-approval:v1',
    assetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
    approvedCandidateId: candidateId,
    approvedStrategy: 'TOP_TRIM',
    approvalSource: source,
    approvedAt: '2026-09-12T00:00:00.000Z',
    approvedByHuman: byHuman,
    acceptedWarnings: ['MOBILE_READABILITY_LOW'],
    requestedAdjustments: [],
    evidenceRefs: ['synthetic'],
    reviewChecklistRefs: ['EVIDENCE_PRESERVED'],
    decisionVersion: 'decision:synthetic:v1',
  };
}

describe('B2-12 crop review + ffmpeg execution contract', () => {
  const { pack, generation, evaluation, dryRun } = content01Pipeline();
  const review = buildCropDecisionReview(dryRun, evaluation);
  const packet = buildHumanReviewPacket(dryRun, evaluation);
  const preview = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });

  it('locks current review as NOT_REVIEWED and not executable', () => {
    expect(dryRun.selectedCandidateId).toBe('crop:top-trim');
    expect(review.humanDecision).toBe('NOT_REVIEWED');
    expect(review.productionExecutionAllowed).toBe(false);
    expect(review.humanDecisionSource).toBeNull();
    expect(packet.note).toBe('PACKET_IS_NOT_APPROVAL');
    const checklist = buildReviewChecklist(dryRun);
    expect(checklist.find((item) => item.id === 'MOBILE_READABILITY_ACCEPTABLE')?.status).toBe('PENDING_HUMAN_REVIEW');
    expect(checklist.find((item) => item.id === 'BACKGROUND_TREATMENT_ACCEPTABLE')?.status).toBe('PENDING_HUMAN_REVIEW');
    expect(checklist.find((item) => item.id === 'TEMPORAL_VARIANCE_ACCEPTABLE')?.status).toBe('PENDING_HUMAN_REVIEW');
    expect(checklist.every((item) => item.status === 'PASS')).toBe(false);
  });

  it('allows PREVIEW_ONLY plan but never authorizes from dry-run', () => {
    expect(preview.mode).toBe('PREVIEW_ONLY');
    expect(preview.executionAuthorized).toBe(false);
    expect(preview.productionExecutionAllowed).toBe(false);
    expect(preview.ffmpegExecuted).toBe(false);
    expect(preview.outputFileCreated).toBe(false);
    expect(preview.audioPolicy).toBe('MUTE_SOURCE_AUDIO');
    expect(preview.durationPreserved).toBe(true);
    expect(preview.trim).toBe('NONE');
    expect(preview.pad?.backgroundTreatment).toBe('UNRESOLVED');
    expect(validateFFmpegCropExecutionPlan({ plan: preview, dryRun, evaluation }).ok).toBe(true);
    expect(authorizeFromDryRunOnly().ok).toBe(false);
    const fakeAuth = { ...preview, mode: 'AUTHORIZED' as const, approvedDecisionRef: 'dry-run', executionAuthorized: true, productionExecutionAllowed: true };
    expect(validateFFmpegCropExecutionPlan({ plan: fakeAuth, dryRun, evaluation, approval: null }).ok).toBe(false);
  });

  it('rejects fake system and director-dry-run approvals', () => {
    const id = dryRun.selectedCandidateId!;
    expect(validateHumanApprovedCropDecision({ approval: syntheticApproval(id, 'SYSTEM_INFERENCE'), evaluation }).ok).toBe(false);
    expect(validateHumanApprovedCropDecision({ approval: syntheticApproval(id, 'DIRECTOR_DRY_RUN'), evaluation }).ok).toBe(false);
  });

  it('accepts synthetic explicit user approval contract without treating it as current approval', () => {
    const approval = syntheticApproval(dryRun.selectedCandidateId!, 'EXPLICIT_USER_MESSAGE');
    expect(validateHumanApprovedCropDecision({ approval, evaluation }).ok).toBe(true);
    expect(review.humanDecision).toBe('NOT_REVIEWED');
  });

  it('rejects human approval of ineligible CENTER_COVER', () => {
    const cover = evaluation.candidates.find((item) => item.strategy === 'CENTER_COVER')!;
    const approval = syntheticApproval(cover.candidateId, 'EXPLICIT_USER_MESSAGE');
    expect(validateHumanApprovedCropDecision({ approval, evaluation }).ok).toBe(false);
  });

  it('rejects AUTHORIZED plan while background is unresolved and accepts SOLID synthetic', () => {
    const approval = syntheticApproval(dryRun.selectedCandidateId!, 'EXPLICIT_USER_MESSAGE');
    const unresolved = buildAuthorizedExecutionPlan({
      dryRun,
      profile: pack.cropInput.profile,
      approval,
      backgroundTreatment: 'UNRESOLVED',
    });
    expect(validateFFmpegCropExecutionPlan({ plan: unresolved, dryRun, evaluation, approval }).ok).toBe(false);
    const resolved = buildAuthorizedExecutionPlan({
      dryRun,
      profile: pack.cropInput.profile,
      approval,
      backgroundTreatment: 'SOLID',
    });
    expect(resolved.pad?.backgroundTreatment).toBe('SOLID');
    expect(validateFFmpegCropExecutionPlan({ plan: resolved, dryRun, evaluation, approval }).ok).toBe(true);
  });

  it('rejects invalid geometry, stretch, and source overwrite', () => {
    expect(() => assertPixelCrop({ x: -1, y: 0, width: 10, height: 10 }, 1920, 1040)).toThrow(ExecutionGeometryError);
    expect(() => assertPixelCrop({ x: 0, y: 0, width: Number.NaN, height: 10 }, 1920, 1040)).toThrow(ExecutionGeometryError);
    expect(() => assertPixelCrop({ x: 0, y: 0, width: 3000, height: 10 }, 1920, 1040)).toThrow(ExecutionGeometryError);
    const stretched = { ...preview, scale: { width: 1080, height: 100, mode: 'UNIFORM' as const }, pad: undefined, executionFitMode: 'CROP_SCALE' as const };
    expect(() => assertNoNonUniformStretch(stretched)).toThrow('NON_UNIFORM_STRETCH');
    expect(validateFFmpegCropExecutionPlan({ plan: { ...preview, outputPathRef: preview.inputPathRef }, dryRun, evaluation }).ok).toBe(false);
  });

  it('aligns odd pixels by at most 1px and stays in bounds', () => {
    const aligned = alignEvenPixelCrop({ x: 1, y: 1, width: 101, height: 51 }, 1920, 1040);
    expect(aligned.adjusted).toBe(true);
    expect(aligned.rect.width % 2).toBe(0);
    expect(aligned.rect.height % 2).toBe(0);
    expect(aligned.rect.width).toBeGreaterThanOrEqual(100);
    assertPixelCrop(aligned.rect, 1920, 1040);
  });

  it('builds deterministic ffmpeg args without executing and preserves candidate geometry', () => {
    const args = buildFFmpegExecutionArgs(preview);
    const again = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
    expect(args.args).toContain('-an');
    expect(args.args).toContain(preview.ffmpegFilterGraph);
    expect(args.mode).toBe('PREVIEW_ONLY');
    expect(preview).toEqual(again);
    expect(preview.inputPathRef.startsWith('asset:')).toBe(true);
    expect(preview.inputPathRef).not.toContain('\\');
    const src = generation.candidates.find((item) => item.candidateId === dryRun.selectedCandidateId)!;
    expect(dryRun.selectedOption?.sourceRect).toEqual(src.sourceRect);
    expect(dryRun.selectedOption?.fitMode).toEqual(src.fitMode);
    expect(dryRun.selectedOption?.safetyStatus).toEqual(src.status);
    expect(notRunPostExecutionValidation().status).toBe('NOT_RUN');
    expect(CONTENT_01_GEOMETRY.targetWidth).toBe(1080);
  });
});

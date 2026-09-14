import { assembleContent01Clean } from '../visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../director-visual-policy/dryrun-assembler.js';
import { buildHumanReviewPacket } from '../crop-execution/review-contract.js';
import type { ReviewFlowContext, TenantScope } from './review-flow.types.js';
import { CropReviewFlowEngine } from './review-flow-engine.js';

export const CONTENT01_SCOPE: TenantScope = {
  tenantId: 'tenant-content01',
  workspaceId: 'workspace-content01',
  projectId: '01a08b3f-9638-7fd1-a1ee-344682fb4809',
  userId: 'user-reviewer',
};

export function content01ReviewContext(): ReviewFlowContext {
  const pack = assembleContent01Clean();
  const generation = generateSemanticCropCandidates(pack);
  const evaluation = evaluateCropComparison(pack, generation);
  const dryRun = runCropSelectionDryRun(evaluation);
  const packet = buildHumanReviewPacket(dryRun, evaluation);
  return {
    packet,
    eligible: evaluation.directorEligibleOptions.map((item) => ({
      candidateId: item.candidateId,
      strategy: item.strategy,
      variant: item.variant,
      eligibility: item.eligibility,
      safetyStatus: item.safetyStatus,
    })),
    ineligible: evaluation.candidates
      .filter((item) => item.eligibility === 'INELIGIBLE' || item.safetyStatus === 'UNSAFE')
      .map((item) => ({
        candidateId: item.candidateId,
        strategy: item.strategy,
        variant: item.variant,
        reason:
          item.strategy === 'CENTER_COVER' ? 'INELIGIBLE HIGH_EVIDENCE_LOSS NAVIGATION_LOSS' : 'INELIGIBLE semantic/safety failure',
      })),
  };
}

export function startContent01Session(engine = new CropReviewFlowEngine(), sessionId = 'session-content01') {
  const ctx = content01ReviewContext();
  const result = engine.create({
    sessionId,
    scope: CONTENT01_SCOPE,
    ctx,
    candidateVersion: `geom:${ctx.packet.dryRunCandidateId}`,
  });
  return { engine, ctx, result };
}

import { deriveFlags } from './context-rules.js';
import type {
  ClaimEvidenceAssessmentV1,
  ClaimEvidenceSupport,
  ContextReasonCode,
  ProjectContextEvaluationInput,
  ProjectContextEvaluationV1,
} from './context.types.js';
import { CLAIM_EVIDENCE_SCHEMA_VERSION } from './context.types.js';

export const CONTENT_01_CLAIM_SET = [
  { id: 'C1', text: '这是一个抖音 AI 智能工作台', defaultContentClaim: true },
  { id: 'C2', text: '系统覆盖多个内容生产环节', defaultContentClaim: true },
  { id: 'C3', text: '系统真实运行中', defaultContentClaim: true },
  { id: 'C4', text: '这不是单纯文案生成器', defaultContentClaim: true },
  { id: 'C5', text: '系统已经实现完全自动无人值守发布', defaultContentClaim: false },
  { id: 'C6', text: '系统保证涨粉/爆款', defaultContentClaim: false },
] as const;

export type Content01ClaimId = (typeof CONTENT_01_CLAIM_SET)[number]['id'];

export function evaluateAssetClaimSupport(
  claimId: Content01ClaimId,
  input: ProjectContextEvaluationInput,
  evaluation: ProjectContextEvaluationV1,
): ClaimEvidenceAssessmentV1 {
  const flags = deriveFlags(input);
  const claim = CONTENT_01_CLAIM_SET.find((item) => item.id === claimId);
  if (!claim) {
    throw new Error('UNKNOWN_CLAIM');
  }
  let support: ClaimEvidenceSupport = 'INSUFFICIENT';
  const reasons: ContextReasonCode[] = [];

  if (claimId === 'C5') {
    support = 'INSUFFICIENT';
    reasons.push('CLAIM_NOT_VALIDATED', 'PUBLISH_PAGE_UNVALIDATED_CAPABILITY');
  } else if (claimId === 'C6') {
    support = 'INSUFFICIENT';
    reasons.push('CLAIM_NOT_VALIDATED');
  } else if (flags.staleConfirmed && flags.mockConfirmed) {
    support = 'CONTRADICTED';
    reasons.push('STALE_HUMAN_CONFIRMED', 'MOCK_CONTAMINATION_HUMAN_CONFIRMED', 'TRUTH_RISK');
  } else if (claimId === 'C1') {
    if (flags.productUi && flags.currentConfirmed) {
      support = 'SUPPORTED';
      reasons.push('CURRENT_PRODUCT_UI', 'REAL_PRODUCT_EVIDENCE');
    } else if (flags.productUi || flags.publishOps || flags.productInfoChat) {
      support = 'PARTIALLY_SUPPORTED';
      reasons.push('CURRENT_PRODUCT_UI');
    } else {
      support = 'INSUFFICIENT';
      reasons.push('INSUFFICIENT_CONTEXT');
    }
  } else if (claimId === 'C2') {
    if (flags.productUi && flags.navigation && flags.contentPanel && flags.currentConfirmed && !flags.emptyState) {
      support = 'PARTIALLY_SUPPORTED';
      reasons.push('WORKFLOW_SURFACES_VISIBLE', 'REAL_PRODUCT_EVIDENCE');
    } else if (flags.publishOps || flags.emptyState) {
      support = 'INSUFFICIENT';
      reasons.push(flags.emptyState ? 'EMPTY_STATE_LIMITATION' : 'PUBLISH_PAGE_UNVALIDATED_CAPABILITY');
    } else {
      support = 'INSUFFICIENT';
      reasons.push('INSUFFICIENT_CONTEXT');
    }
  } else if (claimId === 'C3') {
    if (flags.currentConfirmed && flags.productUi && flags.noKnownMock) {
      support = 'PARTIALLY_SUPPORTED';
      reasons.push('CURRENT_PROJECT_ASSET', 'REAL_PRODUCT_EVIDENCE');
    } else if (flags.staleConfirmed) {
      support = 'CONTRADICTED';
      reasons.push('STALE_HUMAN_CONFIRMED');
    } else {
      support = 'INSUFFICIENT';
      reasons.push('INSUFFICIENT_CONTEXT');
    }
  } else if (claimId === 'C4') {
    if (flags.productUi && flags.contentPanel && flags.currentConfirmed) {
      support = 'PARTIALLY_SUPPORTED';
      reasons.push('WORKFLOW_SURFACES_VISIBLE', 'CURRENT_PRODUCT_UI');
    } else {
      support = 'INSUFFICIENT';
      reasons.push('INSUFFICIENT_CONTEXT');
    }
  }

  return {
    schemaVersion: CLAIM_EVIDENCE_SCHEMA_VERSION,
    assetId: input.assetFacts.assetId,
    claimId,
    claimText: claim.text,
    support,
    reasons: [...new Set(reasons)],
    evidenceRefs: evaluation.sourceRefs.slice(0, 8),
  };
}

export function evaluateClaimMatrix(
  input: ProjectContextEvaluationInput,
  evaluation: ProjectContextEvaluationV1,
): ClaimEvidenceAssessmentV1[] {
  return CONTENT_01_CLAIM_SET.map((claim) => evaluateAssetClaimSupport(claim.id, input, evaluation));
}

import type { CropHumanReviewPacketV1, ReviewItemId } from '../crop-execution/review.types.js';
import {
  CROP_REVIEW_SESSION_VERSION,
  HUMAN_REQUIRED_ITEMS,
  VISIBLE_WARNINGS,
  type ChecklistInteraction,
  type CropReviewSessionV1,
  type ReviewFlowContext,
  type TenantScope,
} from './review-flow.types.js';

function interactionFor(id: ReviewItemId, packet: CropHumanReviewPacketV1): ChecklistInteraction {
  const item = packet.reviewChecklist.find((entry) => entry.id === id);
  if (!item || item.status === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (item.status === 'FAIL') return 'FAILED';
  if (HUMAN_REQUIRED_ITEMS.includes(id)) return 'PENDING_HUMAN';
  if (item.status === 'PASS') return 'PASS_SYSTEM';
  if (item.status === 'WARNING') return 'WARNING_SYSTEM';
  return 'PENDING_HUMAN';
}

export function createReviewSession(input: {
  sessionId: string;
  scope: TenantScope;
  packet: CropHumanReviewPacketV1;
  candidateVersion: string;
  createdAt?: string;
}): CropReviewSessionV1 {
  const createdAt = input.createdAt ?? '1970-01-01T00:00:00.000Z';
  return {
    schemaVersion: CROP_REVIEW_SESSION_VERSION,
    sessionId: input.sessionId,
    assetId: input.packet.assetId,
    dryRunDecisionRef: `dry-run:${input.packet.dryRunCandidateId}`,
    candidateId: input.packet.dryRunCandidateId ?? 'unknown',
    candidateVersion: input.candidateVersion,
    reviewPacketVersion: input.packet.packetVersion,
    previewId: null,
    previewVersion: 'preview:0',
    status: 'CREATED',
    previewStatus: 'PLACEHOLDER_ONLY',
    backgroundTreatment: 'UNRESOLVED',
    requiredChecklist: input.packet.reviewChecklist.map((item) => ({
      id: item.id,
      interaction: interactionFor(item.id, input.packet),
      kind: HUMAN_REQUIRED_ITEMS.includes(item.id) ? 'HUMAN_CONFIRM_REQUIRED' : 'SYSTEM_VERIFIED',
    })),
    warnings: [...VISIBLE_WARNINGS],
    humanDecision: 'NOT_REVIEWED',
    createdAt,
    expiresAt: '1970-01-04T00:00:00.000Z',
    ttlHours: 72,
    invalidationReason: null,
    scope: input.scope,
    approvedDecision: null,
    productionExecutionEligibility: 'NOT_READY',
    productionUsablePreview: false,
  };
}

export function bumpPreviewVersion(session: CropReviewSessionV1): string {
  const n = Number(session.previewVersion.split(':')[1] ?? '0') + 1;
  return `preview:${n}`;
}

export function assertScope(session: CropReviewSessionV1, scope: TenantScope): string | null {
  if (session.scope.tenantId !== scope.tenantId) return 'CROSS_TENANT_FORBIDDEN';
  if (session.scope.workspaceId !== scope.workspaceId) return 'CROSS_WORKSPACE_FORBIDDEN';
  if (scope.projectId && scope.projectId !== 'unbound' && session.scope.projectId !== scope.projectId) return 'CROSS_PROJECT_FORBIDDEN';
  return null;
}

export function cloneSession(session: CropReviewSessionV1): CropReviewSessionV1 {
  return structuredClone(session);
}

export type { ReviewFlowContext };

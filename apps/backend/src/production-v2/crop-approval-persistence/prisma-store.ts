import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  CROP_APPROVAL_PERSISTENCE_VERSION,
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  CROP_REVIEW_PERSISTENCE_VERSION,
  type PersistedHumanApproval,
  type PersistedReviewSession,
  type TenantScope,
} from './persistence.types.js';

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toPersistedSession(row: {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  candidateId: string;
  candidateVersion: string;
  reviewPacketVersion: string;
  previewId: string | null;
  previewVersion: string;
  status: string;
  backgroundTreatment: string;
  requiredWarningsJson: unknown;
  checklistJson: unknown;
  humanDecision: string;
  createdByUserId: string | null;
  reviewedByUserId: string | null;
  expiresAt: Date | null;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PersistedReviewSession {
  return {
    schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    assetId: row.assetId,
    candidateId: row.candidateId,
    candidateVersion: row.candidateVersion,
    reviewPacketVersion: row.reviewPacketVersion,
    previewId: row.previewId,
    previewVersion: row.previewVersion,
    status: row.status,
    backgroundTreatment: row.backgroundTreatment,
    requiredWarningsJson: Array.isArray(row.requiredWarningsJson) ? (row.requiredWarningsJson as string[]) : [],
    checklistJson: Array.isArray(row.checklistJson)
      ? (row.checklistJson as Array<{ id: string; interaction: string; kind: string }>)
      : [],
    humanDecision: row.humanDecision,
    createdByUserId: row.createdByUserId,
    reviewedByUserId: row.reviewedByUserId,
    expiresAt: iso(row.expiresAt),
    invalidatedAt: iso(row.invalidatedAt),
    invalidationReason: row.invalidationReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaCropApprovalStore {
  constructor(private readonly prisma: PrismaClient) {}

  async persistSession(session: PersistedReviewSession): Promise<PersistedReviewSession> {
    const row = await this.prisma.cropReviewSession.upsert({
      where: { id_tenantId: { id: session.id, tenantId: session.tenantId } },
      update: {
        candidateId: session.candidateId,
        candidateVersion: session.candidateVersion,
        reviewPacketVersion: session.reviewPacketVersion,
        previewId: session.previewId,
        previewVersion: session.previewVersion,
        status: session.status as never,
        backgroundTreatment: session.backgroundTreatment,
        requiredWarningsJson: session.requiredWarningsJson,
        checklistJson: session.checklistJson,
        humanDecision: session.humanDecision as never,
        expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
        invalidationReason: session.invalidationReason,
      },
      create: {
        id: session.id,
        tenantId: session.tenantId,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        assetId: session.assetId,
        candidateId: session.candidateId,
        candidateVersion: session.candidateVersion,
        reviewPacketVersion: session.reviewPacketVersion,
        previewId: session.previewId,
        previewVersion: session.previewVersion,
        status: session.status as never,
        backgroundTreatment: session.backgroundTreatment,
        requiredWarningsJson: session.requiredWarningsJson,
        checklistJson: session.checklistJson,
        humanDecision: session.humanDecision as never,
        createdByUserId: session.createdByUserId,
        expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
      },
    });
    return toPersistedSession(row);
  }

  async getSession(id: string, scope: TenantScope): Promise<PersistedReviewSession | null> {
    const row = await this.prisma.cropReviewSession.findFirst({
      where: { id, tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: scope.projectId },
    });
    return row ? toPersistedSession(row) : null;
  }

  async persistApproval(approval: PersistedHumanApproval): Promise<PersistedHumanApproval> {
    const existing = await this.prisma.humanCropApproval.findUnique({
      where: { tenantId_clientActionId: { tenantId: approval.tenantId, clientActionId: approval.clientActionId } },
    });
    if (existing) {
      return { ...approval, id: existing.id, schemaVersion: CROP_APPROVAL_PERSISTENCE_VERSION };
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.humanCropApproval.create({
        data: {
          id: approval.id || randomUUID(),
          tenantId: approval.tenantId,
          workspaceId: approval.workspaceId,
          projectId: approval.projectId,
          reviewSessionId: approval.reviewSessionId,
          assetId: approval.assetId,
          candidateId: approval.candidateId,
          candidateVersion: approval.candidateVersion,
          reviewPacketVersion: approval.reviewPacketVersion,
          previewId: approval.previewId,
          previewVersion: approval.previewVersion,
          backgroundTreatment: approval.backgroundTreatment,
          acceptedWarningsJson: approval.acceptedWarningsJson,
          confirmedChecklistJson: approval.confirmedChecklistJson,
          approvalSource: approval.approvalSource,
          approvedByUserId: approval.approvedByUserId,
          approvedAt: new Date(approval.approvedAt),
          clientActionId: approval.clientActionId,
          status: approval.status,
        },
      });
      await tx.cropReviewSession.update({
        where: { id_tenantId: { id: approval.reviewSessionId, tenantId: approval.tenantId } },
        data: { status: 'APPROVED', humanDecision: 'APPROVED', reviewedByUserId: approval.approvedByUserId },
      });
      return row;
    });
    return { ...approval, id: created.id };
  }
}

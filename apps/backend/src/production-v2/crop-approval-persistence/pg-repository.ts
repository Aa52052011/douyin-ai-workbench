import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CROP_APPROVAL_PERSISTENCE_VERSION,
  CROP_EXECUTION_AUTHORIZATION_VERSION,
  CROP_REVIEW_PERSISTENCE_VERSION,
  type PersistedAuthorization,
  type PersistedHumanApproval,
  type PersistedReviewSession,
} from './persistence.types.js';

function mapSession(row: Record<string, unknown>): PersistedReviewSession {
  return {
    schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    assetId: String(row.asset_id),
    candidateId: String(row.candidate_id),
    candidateVersion: String(row.candidate_version),
    reviewPacketVersion: String(row.review_packet_version),
    previewId: row.preview_id ? String(row.preview_id) : null,
    previewVersion: String(row.preview_version),
    status: String(row.status),
    backgroundTreatment: String(row.background_treatment),
    requiredWarningsJson: Array.isArray(row.required_warnings_json) ? (row.required_warnings_json as string[]) : [],
    checklistJson: Array.isArray(row.checklist_json)
      ? (row.checklist_json as Array<{ id: string; interaction: string; kind: string }>)
      : [],
    humanDecision: String(row.human_decision),
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
    reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    invalidatedAt: row.invalidated_at ? new Date(String(row.invalidated_at)).toISOString() : null,
    invalidationReason: row.invalidation_reason ? String(row.invalidation_reason) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapApproval(row: Record<string, unknown>): PersistedHumanApproval {
  return {
    schemaVersion: CROP_APPROVAL_PERSISTENCE_VERSION,
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    reviewSessionId: String(row.review_session_id),
    assetId: String(row.asset_id),
    candidateId: String(row.candidate_id),
    candidateVersion: String(row.candidate_version),
    reviewPacketVersion: String(row.review_packet_version),
    previewId: String(row.preview_id),
    previewVersion: String(row.preview_version),
    backgroundTreatment: String(row.background_treatment),
    acceptedWarningsJson: Array.isArray(row.accepted_warnings_json) ? (row.accepted_warnings_json as string[]) : [],
    confirmedChecklistJson: Array.isArray(row.confirmed_checklist_json) ? (row.confirmed_checklist_json as string[]) : [],
    approvalSource: String(row.approval_source),
    approvedByUserId: String(row.approved_by_user_id),
    approvedAt: new Date(String(row.approved_at)).toISOString(),
    clientActionId: String(row.client_action_id),
    status: row.status as PersistedHumanApproval['status'],
    invalidationReason: row.invalidation_reason ? String(row.invalidation_reason) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapAuthz(row: Record<string, unknown>): PersistedAuthorization {
  return {
    schemaVersion: CROP_EXECUTION_AUTHORIZATION_VERSION,
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    approvalId: String(row.approval_id),
    reviewSessionId: String(row.review_session_id),
    assetId: String(row.asset_id),
    candidateId: String(row.candidate_id),
    candidateVersion: String(row.candidate_version),
    previewVersion: String(row.preview_version),
    backgroundTreatment: String(row.background_treatment),
    executionPlanVersion: String(row.execution_plan_version),
    clientRequestId: String(row.client_request_id),
    status: row.status as PersistedAuthorization['status'],
    createdAt: new Date(String(row.created_at)).toISOString(),
    consumedAt: row.consumed_at ? new Date(String(row.consumed_at)).toISOString() : null,
  };
}

export const PG_POOL = Symbol('CROP_REVIEW_PG_POOL');

@Injectable()
export class PgCropReviewRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getSession(id: string, tenantId: string): Promise<PersistedReviewSession | null> {
    const result = await this.pool.query('SELECT * FROM crop_review_sessions WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  async getApproval(id: string, tenantId: string): Promise<PersistedHumanApproval | null> {
    const result = await this.pool.query('SELECT * FROM human_crop_approvals WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    return result.rows[0] ? mapApproval(result.rows[0] as Record<string, unknown>) : null;
  }

  async getApprovalByClientAction(tenantId: string, clientActionId: string): Promise<PersistedHumanApproval | null> {
    const result = await this.pool.query(
      'SELECT * FROM human_crop_approvals WHERE tenant_id=$1 AND client_action_id=$2',
      [tenantId, clientActionId],
    );
    return result.rows[0] ? mapApproval(result.rows[0] as Record<string, unknown>) : null;
  }

  async getActiveApprovalForSession(sessionId: string, tenantId: string): Promise<PersistedHumanApproval | null> {
    const result = await this.pool.query(
      `SELECT * FROM human_crop_approvals WHERE review_session_id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
      [sessionId, tenantId],
    );
    return result.rows[0] ? mapApproval(result.rows[0] as Record<string, unknown>) : null;
  }

  async getAuthorizationByClientRequest(tenantId: string, clientRequestId: string): Promise<PersistedAuthorization | null> {
    const result = await this.pool.query(
      'SELECT * FROM crop_execution_authorizations WHERE tenant_id=$1 AND client_request_id=$2',
      [tenantId, clientRequestId],
    );
    return result.rows[0] ? mapAuthz(result.rows[0] as Record<string, unknown>) : null;
  }

  async insertSession(session: PersistedReviewSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO crop_review_sessions (
        id, tenant_id, workspace_id, project_id, asset_id, candidate_id, candidate_version,
        review_packet_version, preview_id, preview_version, status, background_treatment,
        required_warnings_json, checklist_json, human_decision, created_by_user_id, expires_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,NOW(),NOW())`,
      [
        session.id,
        session.tenantId,
        session.workspaceId,
        session.projectId,
        session.assetId,
        session.candidateId,
        session.candidateVersion,
        session.reviewPacketVersion,
        session.previewId,
        session.previewVersion,
        session.status,
        session.backgroundTreatment,
        JSON.stringify(session.requiredWarningsJson),
        JSON.stringify(session.checklistJson),
        session.humanDecision,
        session.createdByUserId,
        session.expiresAt,
      ],
    );
  }

  async updateSessionTerminal(
    id: string,
    tenantId: string,
    patch: { status: string; humanDecision: string; reviewedByUserId: string; reason: string },
  ): Promise<PersistedReviewSession | null> {
    const result = await this.pool.query(
      `UPDATE crop_review_sessions
       SET status=$3, human_decision=$4, reviewed_by_user_id=$5, invalidation_reason=$6, updated_at=NOW()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [id, tenantId, patch.status, patch.humanDecision, patch.reviewedByUserId, patch.reason],
    );
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  async approveInTransaction(approval: PersistedHumanApproval): Promise<PersistedHumanApproval> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await this.insertApprovalTx(client, approval);
      await client.query(
        `UPDATE crop_review_sessions
         SET status='APPROVED', human_decision='APPROVED', reviewed_by_user_id=$3, updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2`,
        [approval.reviewSessionId, approval.tenantId, approval.approvedByUserId],
      );
      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertApprovalTx(client: PoolClient, approval: PersistedHumanApproval): Promise<PersistedHumanApproval> {
    const id = approval.id || randomUUID();
    const result = await client.query(
      `INSERT INTO human_crop_approvals (
        id, tenant_id, workspace_id, project_id, review_session_id, asset_id, candidate_id, candidate_version,
        review_packet_version, preview_id, preview_version, background_treatment, accepted_warnings_json,
        confirmed_checklist_json, approval_source, approved_by_user_id, approved_at, client_action_id, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,NOW(),$17,'ACTIVE',NOW())
      RETURNING *`,
      [
        id,
        approval.tenantId,
        approval.workspaceId,
        approval.projectId,
        approval.reviewSessionId,
        approval.assetId,
        approval.candidateId,
        approval.candidateVersion,
        approval.reviewPacketVersion,
        approval.previewId,
        approval.previewVersion,
        approval.backgroundTreatment,
        JSON.stringify(approval.acceptedWarningsJson),
        JSON.stringify(approval.confirmedChecklistJson),
        approval.approvalSource,
        approval.approvedByUserId,
        approval.clientActionId,
      ],
    );
    return mapApproval(result.rows[0] as Record<string, unknown>);
  }

  async insertAuthorization(row: PersistedAuthorization): Promise<PersistedAuthorization> {
    const result = await this.pool.query(
      `INSERT INTO crop_execution_authorizations (
        id, tenant_id, workspace_id, project_id, approval_id, review_session_id, asset_id, candidate_id,
        candidate_version, preview_version, background_treatment, execution_plan_version, client_request_id, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',NOW())
      RETURNING *`,
      [
        row.id || randomUUID(),
        row.tenantId,
        row.workspaceId,
        row.projectId,
        row.approvalId,
        row.reviewSessionId,
        row.assetId,
        row.candidateId,
        row.candidateVersion,
        row.previewVersion,
        row.backgroundTreatment,
        row.executionPlanVersion,
        row.clientRequestId,
      ],
    );
    return mapAuthz(result.rows[0] as Record<string, unknown>);
  }

  async updateSessionFields(
    id: string,
    tenantId: string,
    patch: {
      status?: string;
      backgroundTreatment?: string;
      previewId?: string | null;
      previewVersion?: string;
      checklistJson?: Array<{ id: string; interaction: string; kind: string }>;
      reviewPacketVersion?: string;
      humanDecision?: string;
      invalidationReason?: string | null;
    },
  ): Promise<PersistedReviewSession | null> {
    const current = await this.getSession(id, tenantId);
    if (!current) return null;
    const next = {
      status: patch.status ?? current.status,
      backgroundTreatment: patch.backgroundTreatment ?? current.backgroundTreatment,
      previewId: patch.previewId === undefined ? current.previewId : patch.previewId,
      previewVersion: patch.previewVersion ?? current.previewVersion,
      checklistJson: patch.checklistJson ?? current.checklistJson,
      reviewPacketVersion: patch.reviewPacketVersion ?? current.reviewPacketVersion,
      humanDecision: patch.humanDecision ?? current.humanDecision,
      invalidationReason: patch.invalidationReason === undefined ? current.invalidationReason : patch.invalidationReason,
    };
    const result = await this.pool.query(
      `UPDATE crop_review_sessions
       SET status=$3, background_treatment=$4, preview_id=$5, preview_version=$6,
           checklist_json=$7::jsonb, review_packet_version=$8, human_decision=$9,
           invalidation_reason=$10, updated_at=NOW()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [
        id,
        tenantId,
        next.status,
        next.backgroundTreatment,
        next.previewId,
        next.previewVersion,
        JSON.stringify(next.checklistJson),
        next.reviewPacketVersion,
        next.humanDecision,
        next.invalidationReason,
      ],
    );
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  async getAssetStorageKey(assetId: string, tenantId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
      [assetId, tenantId],
    );
    const key = result.rows[0]?.storage_key;
    return typeof key === 'string' && key.length ? key : null;
  }

  isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
  }
}

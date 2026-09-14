import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../crop-approval-persistence/pg-repository.js';
import { OUTPUT_SELECTION_VERSION, type OutputSelectionPersistenceV1 } from './dual-output.js';
import type { OutputSelectionStore } from './selection-store.js';

function mapRow(row: Record<string, unknown>): OutputSelectionPersistenceV1 {
  return {
    schemaVersion: OUTPUT_SELECTION_VERSION,
    selectionId: String(row.selection_id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    contentId: row.content_id ? String(row.content_id) : undefined,
    reviewSessionId: String(row.review_session_id),
    sourceVisualType: String(row.source_visual_type),
    selectedStrategy: row.selected_strategy as OutputSelectionPersistenceV1['selectedStrategy'],
    selectedProfileIds: Array.isArray(row.selected_profile_ids) ? (row.selected_profile_ids as string[]) : [],
    selectionSource: row.selection_source as OutputSelectionPersistenceV1['selectionSource'],
    humanFeedbackRef: row.human_feedback_ref ? String(row.human_feedback_ref) : undefined,
    verticalPreference: row.vertical_preference ? String(row.vertical_preference) : undefined,
    landscapePreference: row.landscape_preference ? String(row.landscape_preference) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

@Injectable()
export class PgOutputSelectionRepository implements OutputSelectionStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsert(selection: OutputSelectionPersistenceV1): Promise<OutputSelectionPersistenceV1> {
    const result = await this.pool.query(
      `INSERT INTO output_strategy_selections (
         selection_id, tenant_id, workspace_id, project_id, content_id, review_session_id,
         source_visual_type, selected_strategy, selected_profile_ids, selection_source,
         human_feedback_ref, vertical_preference, landscape_preference, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (tenant_id, review_session_id)
       DO UPDATE SET
         selected_strategy = EXCLUDED.selected_strategy,
         selected_profile_ids = EXCLUDED.selected_profile_ids,
         selection_source = EXCLUDED.selection_source,
         human_feedback_ref = EXCLUDED.human_feedback_ref,
         vertical_preference = EXCLUDED.vertical_preference,
         landscape_preference = EXCLUDED.landscape_preference,
         source_visual_type = EXCLUDED.source_visual_type,
         content_id = EXCLUDED.content_id,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        selection.selectionId,
        selection.tenantId,
        selection.workspaceId,
        selection.projectId,
        selection.contentId ?? null,
        selection.reviewSessionId,
        selection.sourceVisualType,
        selection.selectedStrategy,
        JSON.stringify(selection.selectedProfileIds),
        selection.selectionSource,
        selection.humanFeedbackRef ?? null,
        selection.verticalPreference ?? null,
        selection.landscapePreference ?? null,
        selection.createdAt,
        selection.updatedAt,
      ],
    );
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    const result = await this.pool.query(
      `SELECT * FROM output_strategy_selections WHERE tenant_id = $1 AND review_session_id = $2`,
      [tenantId, reviewSessionId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async getBySelectionId(tenantId: string, selectionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    const result = await this.pool.query(
      `SELECT * FROM output_strategy_selections WHERE tenant_id = $1 AND selection_id = $2`,
      [tenantId, selectionId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }
}

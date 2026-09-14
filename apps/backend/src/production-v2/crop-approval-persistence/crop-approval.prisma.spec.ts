import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startTestDatabase, stopTestDatabase } from '../../../../../database/test/harness.ts';
import pg from 'pg';

describe('B2-14 prisma crop approval persistence', () => {
  let client: pg.Client;
  let tenantId: string;
  let workspaceId: string;
  let projectId: string;
  let otherTenant: string;

  beforeAll(async () => {
    const databaseUrl = await startTestDatabase();
    migrateDeploy(databaseUrl);
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    tenantId = randomUUID();
    workspaceId = randomUUID();
    projectId = randomUUID();
    otherTenant = randomUUID();
    await client.query('INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())', [
      tenantId,
      't-b214',
      `t-b214-${tenantId.slice(0, 8)}`,
    ]);
    await client.query('INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())', [
      otherTenant,
      't-b214-other',
      `t-b214o-${otherTenant.slice(0, 8)}`,
    ]);
    await client.query(
      'INSERT INTO workspaces (id, tenant_id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())',
      [workspaceId, tenantId, 'ws', `ws-${workspaceId.slice(0, 8)}`],
    );
    await client.query(
      'INSERT INTO projects (id, tenant_id, workspace_id, name, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())',
      [projectId, tenantId, workspaceId, 'p'],
    );
  });

  afterAll(async () => {
    await client?.end();
    await stopTestDatabase();
  });

  it('creates, reloads, and tenant-scopes a review session', async () => {
    const sessionId = randomUUID();
    const assetId = randomUUID();
    await client.query(
      `INSERT INTO crop_review_sessions (
        id, tenant_id, workspace_id, project_id, asset_id, candidate_id, candidate_version,
        review_packet_version, preview_id, preview_version, status, background_treatment,
        required_warnings_json, checklist_json, human_decision, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'READY_FOR_REVIEW','UNRESOLVED','[]'::jsonb,'[]'::jsonb,'NOT_REVIEWED',NOW(),NOW())`,
      [
        sessionId,
        tenantId,
        workspaceId,
        projectId,
        assetId,
        'crop:top-trim',
        'geom:crop:top-trim',
        'crop.human-review-packet:v1',
        'pv:db',
        'preview:runtime-1',
      ],
    );
    const loaded = await client.query(
      'SELECT human_decision, status, background_treatment FROM crop_review_sessions WHERE id=$1 AND tenant_id=$2',
      [sessionId, tenantId],
    );
    expect(loaded.rows[0].human_decision).toBe('NOT_REVIEWED');
    expect(loaded.rows[0].status).toBe('READY_FOR_REVIEW');
    const cross = await client.query(
      'SELECT id FROM crop_review_sessions WHERE id=$1 AND tenant_id=$2',
      [sessionId, otherTenant],
    );
    expect(cross.rowCount).toBe(0);
  });
});

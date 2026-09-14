import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startTestDatabase, stopTestDatabase } from '../../../../../database/test/harness.ts';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../authz/permissions.guard.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { CropReviewController } from '../crop-review-flow/crop-review.controller.js';
import { DurableCropReviewHttpService } from './durable-http.service.js';
import { CropReviewPreviewRuntimeService } from './crop-review-preview-runtime.service.js';
import { PG_POOL, PgCropReviewRepository } from './pg-repository.js';
import { PgOutputSelectionRepository } from '../source-aware-output/output-selection.repository.js';
import { buildOutputSelection } from '../source-aware-output/dual-output.js';
import { CROP_HUMAN_APPROVAL_COMMAND_VERSION } from '../crop-review-flow/review-flow.types.js';
import { writeSyntheticPreviewBytes, previewStoreFile } from './preview-media-store.js';
import { CROP_REVIEW_PERSISTENCE_VERSION, type PersistedReviewSession } from './persistence.types.js';

function authGuard(current: { value: AuthContext }): { canActivate: (ctx: { switchToHttp: () => { getRequest: () => { auth?: AuthContext } } }) => boolean } {
  return {
    canActivate(ctx) {
      ctx.switchToHttp().getRequest().auth = current.value;
      return true;
    },
  };
}

const CONFIRMED = [
  { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
  { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
  { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
  { id: 'PRODUCT_UI_READABLE', interaction: 'CONFIRMED_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
];

describe('B2-14A durable HTTP crop review', () => {
  let app: INestApplication;
  let pool: Pool;
  let repo: PgCropReviewRepository;
  let tenantA: AuthContext;
  let tenantB: AuthContext;
  let projectA: string;
  let workspaceA: string;

  async function seedTenant() {
    const tenantId = randomUUID();
    const workspaceId = randomUUID();
    const projectId = randomUUID();
    await pool.query('INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())', [
      tenantId,
      `t-${tenantId.slice(0, 6)}`,
      `s-${tenantId.slice(0, 8)}`,
    ]);
    await pool.query('INSERT INTO workspaces (id, tenant_id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())', [
      workspaceId,
      tenantId,
      'ws',
      `ws-${workspaceId.slice(0, 8)}`,
    ]);
    await pool.query('INSERT INTO projects (id, tenant_id, workspace_id, name, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())', [
      projectId,
      tenantId,
      workspaceId,
      'p',
    ]);
    return { tenantId, workspaceId, projectId, userId: randomUUID() };
  }

  async function insertSession(input: Partial<PersistedReviewSession> & { tenantId: string; workspaceId: string; projectId: string }): Promise<string> {
    const id = input.id ?? randomUUID();
    const session: PersistedReviewSession = {
      schemaVersion: CROP_REVIEW_PERSISTENCE_VERSION,
      id,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      assetId: input.assetId ?? randomUUID(),
      candidateId: input.candidateId ?? 'crop:top-trim',
      candidateVersion: input.candidateVersion ?? 'geom:crop:top-trim',
      reviewPacketVersion: input.reviewPacketVersion ?? 'crop.human-review-packet:v1',
      previewId: input.previewId ?? 'pv:http-synthetic',
      previewVersion: input.previewVersion ?? 'preview:runtime-1',
      status: input.status ?? 'READY_FOR_REVIEW',
      backgroundTreatment: input.backgroundTreatment ?? 'SOLID',
      requiredWarningsJson: input.requiredWarningsJson ?? ['MOBILE_READABILITY_LOW'],
      checklistJson: input.checklistJson ?? CONFIRMED,
      humanDecision: input.humanDecision ?? 'NOT_REVIEWED',
      createdByUserId: input.createdByUserId ?? tenantA.userId,
      reviewedByUserId: null,
      expiresAt: null,
      invalidatedAt: null,
      invalidationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.insertSession(session);
    if (session.previewId) {
      writeSyntheticPreviewBytes({ tenantId: session.tenantId, sessionId: id, previewVersion: session.previewVersion });
    }
    return id;
  }

  beforeAll(async () => {
    const databaseUrl = await startTestDatabase();
    process.env.DATABASE_URL = databaseUrl;
    migrateDeploy(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    repo = new PgCropReviewRepository(pool);
    const a = await seedTenant();
    const b = await seedTenant();
    tenantA = { userId: a.userId, tenantId: a.tenantId, workspaceId: a.workspaceId, role: 'OWNER' };
    tenantB = { userId: b.userId, tenantId: b.tenantId, workspaceId: b.workspaceId, role: 'OWNER' };
    projectA = a.projectId;
    workspaceA = a.workspaceId;
    const current = { value: tenantA };
    const moduleRef = await Test.createTestingModule({
      controllers: [CropReviewController],
      providers: [
        DurableCropReviewHttpService,
        CropReviewPreviewRuntimeService,
        { provide: PG_POOL, useValue: pool },
        PgCropReviewRepository,
        PgOutputSelectionRepository,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard(current))
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    const { configureApp } = await import('../../configure-app.js');
    configureApp(app);
    await app.init();
    (app as INestApplication & { currentAuth?: { value: AuthContext } }).currentAuth = current;
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await stopTestDatabase();
  });

  function setAuth(next: AuthContext) {
    ((app as INestApplication & { currentAuth: { value: AuthContext } }).currentAuth).value = next;
  }

  it('approves via HTTP into postgres, survives new repository instance, and is idempotent', async () => {
    setAuth(tenantA);
    const sessionId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const command = {
      schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
      sessionId,
      assetId: (await repo.getSession(sessionId, tenantA.tenantId))!.assetId,
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      reviewPacketVersion: 'crop.human-review-packet:v1',
      previewRef: 'pv:http-synthetic',
      previewVersion: 'preview:runtime-1',
      backgroundTreatmentSelection: 'SOLID',
      acceptedWarnings: ['MOBILE_READABILITY_LOW'],
      explicitAction: 'APPROVE',
      clientActionId: `act-${sessionId}`,
      approvalSource: 'USER_UI_ACTION',
    };
    const first = await request(app.getHttpServer()).post(`/production-v2/crop-review/${sessionId}/approve`).send(command);
    expect([200, 201]).toContain(first.status);
    expect(first.body.ok).toBe(true);
    expect(first.body.sourceOfTruth).toBe('POSTGRES');
    const approvalId = first.body.value.approval.id as string;
    const db = await pool.query('SELECT * FROM human_crop_approvals WHERE id=$1', [approvalId]);
    expect(db.rowCount).toBe(1);
    expect(db.rows[0].status).toBe('ACTIVE');
    const sessionRow = await pool.query('SELECT status, human_decision FROM crop_review_sessions WHERE id=$1', [sessionId]);
    expect(sessionRow.rows[0].status).toBe('APPROVED');
    const replay = await request(app.getHttpServer()).post(`/production-v2/crop-review/${sessionId}/approve`).send(command);
    expect(replay.body.value.approval.id).toBe(approvalId);
    const freshRepo = new PgCropReviewRepository(pool);
    const reloaded = await freshRepo.getSession(sessionId, tenantA.tenantId);
    expect(reloaded?.status).toBe('APPROVED');
    const freshService = new DurableCropReviewHttpService(freshRepo);
    const got = await freshService.getReview(tenantA, sessionId, projectA);
    expect(got.session.status).toBe('APPROVED');
    expect(got.approval?.id).toBe(approvalId);
    const authz = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/authorize-execution`)
      .send({ approvalId, clientRequestId: `req-${sessionId}` });
    expect(authz.body.ok).toBe(true);
    expect(authz.body.ffmpegSpawned).toBe(false);
    const authzRow = await pool.query('SELECT * FROM crop_execution_authorizations WHERE approval_id=$1', [approvalId]);
    expect(authzRow.rowCount).toBe(1);
    const runs = await pool.query('SELECT id FROM crop_execution_runs WHERE approval_id=$1', [approvalId]);
    expect(runs.rowCount).toBe(0);
  });

  it('rejects cross-tenant GET/approve and persists reject + request-changes', async () => {
    setAuth(tenantA);
    const sessionId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    setAuth(tenantB);
    const denied = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(denied.status).toBe(404);
    setAuth(tenantA);
    const rejectId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const rejected = await request(app.getHttpServer()).post(`/production-v2/crop-review/${rejectId}/reject`).send({ reason: 'READABILITY_BAD' });
    expect(rejected.body.ok).toBe(true);
    const fresh = new PgCropReviewRepository(pool);
    expect((await fresh.getSession(rejectId, tenantA.tenantId))?.status).toBe('REJECTED');
    const changeId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const changed = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${changeId}/request-changes`)
      .send({ request: 'CHANGE_BACKGROUND' });
    expect(changed.body.ok).toBe(true);
    expect((await fresh.getSession(changeId, tenantA.tenantId))?.humanDecision).toBe('REQUEST_CHANGES');
  });

  it('rejects stale preview, unresolved background, missing approval authorize, and DB failure without memory fallback', async () => {
    setAuth(tenantA);
    const staleId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const session = await repo.getSession(staleId, tenantA.tenantId);
    const stale = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${staleId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId: staleId,
        assetId: session!.assetId,
        candidateId: 'crop:top-trim',
        candidateVersion: 'geom:crop:top-trim',
        reviewPacketVersion: 'crop.human-review-packet:v1',
        previewRef: 'pv:http-synthetic',
        previewVersion: 'preview:old',
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `stale-${staleId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(stale.body.ok).toBe(false);
    expect(stale.body.code).toBe('STALE_REVIEW_SESSION');
    expect((await pool.query('SELECT id FROM human_crop_approvals WHERE client_action_id=$1', [`stale-${staleId}`])).rowCount).toBe(0);
    const unresolvedId = await insertSession({
      tenantId: tenantA.tenantId,
      workspaceId: workspaceA,
      projectId: projectA,
      backgroundTreatment: 'UNRESOLVED',
    });
    const unresolved = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${unresolvedId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId: unresolvedId,
        assetId: (await repo.getSession(unresolvedId, tenantA.tenantId))!.assetId,
        candidateId: 'crop:top-trim',
        candidateVersion: 'geom:crop:top-trim',
        reviewPacketVersion: 'crop.human-review-packet:v1',
        previewRef: 'pv:http-synthetic',
        previewVersion: 'preview:runtime-1',
        backgroundTreatmentSelection: 'UNRESOLVED',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `unres-${unresolvedId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(unresolved.body.ok).toBe(false);
    expect(unresolved.body.code).toBe('UNRESOLVED_BACKGROUND');
    const noAuthz = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${unresolvedId}/authorize-execution`)
      .send({ approvalId: randomUUID(), clientRequestId: `no-${unresolvedId}` });
    expect(noAuthz.body.ok).toBe(false);
    const throwing = new DurableCropReviewHttpService({
      getSession: async () => {
        throw new Error('db down');
      },
    } as unknown as PgCropReviewRepository);
    const failed = await throwing.approve(tenantA, unresolvedId, {
      schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
      sessionId: unresolvedId,
      assetId: randomUUID(),
      candidateId: 'crop:top-trim',
      candidateVersion: 'geom:crop:top-trim',
      reviewPacketVersion: 'crop.human-review-packet:v1',
      previewRef: 'x',
      previewVersion: 'preview:runtime-1',
      backgroundTreatmentSelection: 'SOLID',
      acceptedWarnings: [],
      explicitAction: 'APPROVE',
      clientActionId: 'fail-db',
      approvalSource: 'USER_UI_ACTION',
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('PERSISTENCE_FAILED');
    expect((await pool.query('SELECT id FROM human_crop_approvals WHERE client_action_id=$1', ['fail-db'])).rowCount).toBe(0);
  });

  it('rejects wrong candidate version, project scope mismatch, hard block, and revoked/invalidated authorize', async () => {
    setAuth(tenantA);
    const sessionId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const session = await repo.getSession(sessionId, tenantA.tenantId);
    const wrongVersion = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId,
        assetId: session!.assetId,
        candidateId: 'crop:top-trim',
        candidateVersion: 'geom:stale-candidate',
        reviewPacketVersion: 'crop.human-review-packet:v1',
        previewRef: 'pv:http-synthetic',
        previewVersion: 'preview:runtime-1',
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `wrong-ver-${sessionId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(wrongVersion.body.ok).toBe(false);
    expect(wrongVersion.body.code).toBe('STALE_CANDIDATE_VERSION');
    const wrongProject = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}?projectId=${randomUUID()}`);
    expect(wrongProject.status).toBeGreaterThanOrEqual(400);
    const blockedId = await insertSession({
      tenantId: tenantA.tenantId,
      workspaceId: workspaceA,
      projectId: projectA,
      checklistJson: [
        ...CONFIRMED,
        { id: 'NO_PRIVACY_RIGHTS_BLOCKER', interaction: 'FAILED', kind: 'HARD_BLOCK' },
      ],
    });
    const blocked = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${blockedId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId: blockedId,
        assetId: (await repo.getSession(blockedId, tenantA.tenantId))!.assetId,
        candidateId: 'crop:top-trim',
        candidateVersion: 'geom:crop:top-trim',
        reviewPacketVersion: 'crop.human-review-packet:v1',
        previewRef: 'pv:http-synthetic',
        previewVersion: 'preview:runtime-1',
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `hard-${blockedId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(blocked.body.ok).toBe(false);
    expect(blocked.body.code).toBe('HARD_BLOCKER');
    const authzId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const approved = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${authzId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId: authzId,
        assetId: (await repo.getSession(authzId, tenantA.tenantId))!.assetId,
        candidateId: 'crop:top-trim',
        candidateVersion: 'geom:crop:top-trim',
        reviewPacketVersion: 'crop.human-review-packet:v1',
        previewRef: 'pv:http-synthetic',
        previewVersion: 'preview:runtime-1',
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `rev-${authzId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    const approvalId = approved.body.value.approval.id as string;
    await pool.query(`UPDATE human_crop_approvals SET status='REVOKED' WHERE id=$1`, [approvalId]);
    const revoked = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${authzId}/authorize-execution`)
      .send({ approvalId, clientRequestId: `revoked-${authzId}` });
    expect(revoked.body.ok).toBe(false);
    await pool.query(`UPDATE human_crop_approvals SET status='INVALIDATED' WHERE id=$1`, [approvalId]);
    const invalidated = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${authzId}/authorize-execution`)
      .send({ approvalId, clientRequestId: `inv-${authzId}` });
    expect(invalidated.body.ok).toBe(false);
  });

  it('does not approve Content #1 asset records', async () => {
    const rows = await pool.query(
      `SELECT human_decision, status FROM crop_review_sessions WHERE asset_id=$1`,
      ['803fafd2-4c0e-4412-80d7-a0d6452cefac'],
    );
    for (const row of rows.rows) {
      expect(row.human_decision).not.toBe('APPROVED');
    }
  });

  it('wires live GET, preview delivery, background invalidation, checklist, and synthetic approve without ffmpeg', async () => {
    setAuth(tenantA);
    const pending = [
      { id: 'MOBILE_READABILITY_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'BACKGROUND_TREATMENT_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'TEMPORAL_VARIANCE_ACCEPTABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'PRODUCT_UI_READABLE', interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' },
      { id: 'NO_PRIVACY_RIGHTS_BLOCKER', interaction: 'PASS_SYSTEM', kind: 'SYSTEM_VERIFIED' },
    ];
    const sessionId = await insertSession({
      tenantId: tenantA.tenantId,
      workspaceId: workspaceA,
      projectId: projectA,
      backgroundTreatment: 'UNRESOLVED',
      checklistJson: pending,
      previewId: 'pv:http-synthetic',
      previewVersion: 'preview:runtime-1',
      status: 'READY_FOR_REVIEW',
    });
    writeSyntheticPreviewBytes({
      tenantId: tenantA.tenantId,
      sessionId,
      previewVersion: 'preview:runtime-1',
    });
    const loaded = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}?projectId=${projectA}`);
    expect(loaded.body.ok).toBe(true);
    expect(loaded.body.sourceOfTruth).toBe('POSTGRES');
    expect(loaded.body.approveButton.enabled).toBe(false);
    expect(loaded.body.approveButton.reasons).toEqual(expect.arrayContaining(['BACKGROUND_UNRESOLVED', 'REQUIRED_HUMAN_CHECKS_INCOMPLETE']));
    expect(loaded.body.candidate.strategy).toBe('TOP_TRIM');
    expect(loaded.body.preview.smokePlaceholder).toBe(true);
    expect(loaded.body.preview.mediaUrl).toBe(`/production-v2/crop-review/${sessionId}/preview-media`);
    expect(JSON.stringify(loaded.body)).not.toMatch(/[A-Za-z]:\\/);
    const media = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}/preview-media`);
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toMatch(/video\/mp4/);
    setAuth(tenantB);
    const deniedMedia = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}/preview-media`);
    expect(deniedMedia.status).toBe(404);
    setAuth(tenantA);
    const locked = await request(app.getHttpServer())
      .patch(`/production-v2/crop-review/${sessionId}/checklist`)
      .send({ itemId: 'NO_PRIVACY_RIGHTS_BLOCKER', interaction: 'CONFIRMED_HUMAN' });
    expect(locked.body.ok).toBe(false);
    const bg = await request(app.getHttpServer())
      .patch(`/production-v2/crop-review/${sessionId}/background`)
      .send({ backgroundTreatment: 'SOLID' });
    expect(bg.body.ok).toBe(true);
    expect(bg.body.previewStatus).toBe('STALE');
    const afterBg = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(afterBg.body.session.status).toBe('PREVIEW_PENDING');
    expect(afterBg.body.session.previewId).toBeNull();
    expect(afterBg.body.approveButton.enabled).toBe(false);
    expect(afterBg.body.session.previewVersion).not.toBe('preview:runtime-1');
    const regen = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/preview`)
      .send({ intent: 'REQUEST_RENDER', solidColor: '#000000' });
    expect(regen.body.ok).toBe(false);
    expect(regen.body.ffmpegSpawned ?? false).toBe(false);
    const attach = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/preview`)
      .send({ intent: 'ATTACH_SYNTHETIC_READY' });
    expect(attach.body.ok).toBe(true);
    expect(attach.body.ffmpegSpawned).toBe(false);
    const readyVersion = attach.body.value.previewVersion as string;
    writeSyntheticPreviewBytes({ tenantId: tenantA.tenantId, sessionId, previewVersion: readyVersion });
    for (const itemId of [
      'MOBILE_READABILITY_ACCEPTABLE',
      'BACKGROUND_TREATMENT_ACCEPTABLE',
      'TEMPORAL_VARIANCE_ACCEPTABLE',
      'PRODUCT_UI_READABLE',
    ]) {
      const chk = await request(app.getHttpServer())
        .patch(`/production-v2/crop-review/${sessionId}/checklist`)
        .send({ itemId, interaction: 'CONFIRMED_HUMAN' });
      expect(chk.body.ok).toBe(true);
    }
    const gated = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(gated.body.approveButton.enabled).toBe(true);
    const session = gated.body.session;
    const approved = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId,
        assetId: session.assetId,
        candidateId: session.candidateId,
        candidateVersion: session.candidateVersion,
        reviewPacketVersion: session.reviewPacketVersion,
        previewRef: gated.body.preview.abstractRef,
        previewVersion: session.previewVersion,
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `ui-${sessionId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(approved.body.ok).toBe(true);
    const db = await pool.query('SELECT status FROM human_crop_approvals WHERE review_session_id=$1', [sessionId]);
    expect(db.rowCount).toBe(1);
    const reloaded = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(reloaded.body.session.status).toBe('APPROVED');
    const authz = await pool.query(
      'SELECT id FROM crop_execution_authorizations WHERE review_session_id=$1',
      [sessionId],
    );
    expect(authz.rowCount).toBe(0);
    const approvalId = (await pool.query('SELECT id FROM human_crop_approvals WHERE review_session_id=$1', [sessionId])).rows[0]?.id;
    const runs = await pool.query('SELECT id FROM crop_execution_runs WHERE approval_id=$1', [approvalId]);
    expect(runs.rowCount ?? 0).toBe(0);
  });

  it('GET/media/approve reconcile missing preview artifact instead of trusting DB READY', async () => {
    setAuth(tenantA);
    const sessionId = await insertSession({
      tenantId: tenantA.tenantId,
      workspaceId: workspaceA,
      projectId: projectA,
      backgroundTreatment: 'SOLID',
      previewId: 'pv:missing',
      previewVersion: 'preview:runtime-1',
      status: 'READY_FOR_REVIEW',
    });
    const file = previewStoreFile({
      tenantId: tenantA.tenantId,
      sessionId,
      previewVersion: 'preview:runtime-1',
    });
    unlinkSync(file);
    const loaded = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(loaded.body.preview.status).toBe('STALE');
    expect(loaded.body.preview.failureCode).toBe('PREVIEW_ARTIFACT_MISSING');
    expect(loaded.body.preview.playable).toBe(false);
    expect(loaded.body.session.status).toBe('PREVIEW_PENDING');
    expect(loaded.body.approveButton.enabled).toBe(false);
    expect(loaded.body.approveButton.reasons).toEqual(expect.arrayContaining(['PREVIEW_ARTIFACT_MISSING']));
    const media = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}/preview-media`);
    expect(media.status).toBe(404);
    expect(media.body.code).toBe('PREVIEW_ARTIFACT_MISSING');
    const session = loaded.body.session;
    const approved = await request(app.getHttpServer())
      .post(`/production-v2/crop-review/${sessionId}/approve`)
      .send({
        schemaVersion: CROP_HUMAN_APPROVAL_COMMAND_VERSION,
        sessionId,
        assetId: session.assetId,
        candidateId: session.candidateId,
        candidateVersion: session.candidateVersion,
        reviewPacketVersion: session.reviewPacketVersion,
        previewRef: loaded.body.preview.abstractRef,
        previewVersion: session.previewVersion,
        backgroundTreatmentSelection: 'SOLID',
        acceptedWarnings: ['MOBILE_READABILITY_LOW'],
        explicitAction: 'APPROVE',
        clientActionId: `missing-${sessionId}`,
        approvalSource: 'USER_UI_ACTION',
      });
    expect(approved.body.ok).toBe(false);
    expect(approved.body.code).toBe('PREVIEW_ARTIFACT_MISSING');
  });

  it('persists dual output selection without approval or authorization and scopes by tenant', async () => {
    setAuth(tenantA);
    const sessionId = await insertSession({ tenantId: tenantA.tenantId, workspaceId: workspaceA, projectId: projectA });
    const repo = new PgOutputSelectionRepository(pool);
    await repo.upsert(
      buildOutputSelection({
        selectionId: randomUUID(),
        tenantId: tenantA.tenantId,
        workspaceId: workspaceA,
        projectId: projectA,
        reviewSessionId: sessionId,
        sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
        selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
        selectionSource: 'EXPLICIT_USER_MESSAGE',
      }),
    );
    const loaded = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`).query({ projectId: projectA });
    expect(loaded.status).toBe(200);
    expect(loaded.body.outputSelection.selectedStrategy).toBe('DUAL_VERTICAL_AND_LANDSCAPE');
    expect(loaded.body.outputSelection.selectionSource).toBe('EXPLICIT_USER_MESSAGE');
    expect(loaded.body.outputSelection.humanApproved).toBe(false);
    expect(loaded.body.outputSelection.approvalObject).toBeNull();
    expect(loaded.body.outputSelection.productionAuthorized).toBe(false);
    expect(loaded.body.approval).toBeNull();
    expect(loaded.body.finalReadiness.visualApproval).toBe('NOT_YET');
    expect(loaded.body.finalReadiness.executionPlanStatus).toBe('WAITING_FOR_VISUAL_APPROVAL');
    expect(loaded.body.finalReadiness.productionAuthorization).toBe(false);
    expect(loaded.body.finalReadiness.authorizationObject).toBeNull();
    expect(loaded.body.finalReadiness.readyToRender).toBe(false);
    expect(loaded.body.finalReadiness.productionUsable).toBe(false);
    expect(loaded.body.finalReadiness.restrictedClaims).toEqual(['C5', 'C6']);
    setAuth(tenantB);
    const cross = await request(app.getHttpServer()).get(`/production-v2/crop-review/${sessionId}`);
    expect(cross.status).toBeGreaterThanOrEqual(400);
    expect(await repo.getByReviewSession(tenantB.tenantId, sessionId)).toBeNull();
  });
});

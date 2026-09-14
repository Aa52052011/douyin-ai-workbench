import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reconcilePreviewArtifact } from './preview-artifact-reconciliation.js';
import { previewStoreFile } from './preview-media-store.js';
import { writePreviewSidecar } from './preview-sidecar.js';

const tenantId = `recon-${Date.now()}`;
const sessionId = `session-${process.pid}`;
const previewVersion = 'preview:runtime-1';

function loc() {
  return { tenantId, sessionId, previewVersion, assetId: 'asset-a', dbLooksReady: true };
}

function cleanup() {
  const file = previewStoreFile({ tenantId, sessionId, previewVersion });
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(file.replace(/\.mp4$/i, '.json'));
  } catch {
    /* ignore */
  }
}

afterEach(cleanup);

describe('preview artifact reconciliation', () => {
  it('READY when file exists and is large enough', () => {
    const file = previewStoreFile({ tenantId, sessionId, previewVersion });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(64, 1));
    const recon = reconcilePreviewArtifact({
      ...loc(),
      probe: () => null,
    });
    expect(recon.status).toBe('READY');
    expect(recon.playable).toBe(true);
  });

  it('MISSING_ARTIFACT when DB READY but file missing', () => {
    const recon = reconcilePreviewArtifact({
      ...loc(),
      probe: () => null,
    });
    expect(recon.status).toBe('MISSING_ARTIFACT');
    expect(recon.failureCode).toBe('PREVIEW_ARTIFACT_MISSING');
    expect(recon.playable).toBe(false);
  });

  it('FAILED when file is corrupt (tiny)', () => {
    const file = previewStoreFile({ tenantId, sessionId, previewVersion });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(8, 1));
    const recon = reconcilePreviewArtifact({
      ...loc(),
      probe: () => null,
    });
    expect(recon.status).toBe('FAILED');
    expect(recon.failureCode).toBe('OUTPUT_INVALID');
  });

  it('FAILED when probe reports wrong resolution', () => {
    const file = previewStoreFile({ tenantId, sessionId, previewVersion });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(64, 1));
    const recon = reconcilePreviewArtifact({
      ...loc(),
      probe: () => ({ ok: true, width: 1920, height: 1080, hasVideo: true, hasAudio: false }),
    });
    expect(recon.status).toBe('FAILED');
    expect(recon.failureCode).toBe('OUTPUT_INVALID');
  });

  it('marks placeholder sidecar as not background-approval eligible', () => {
    const file = previewStoreFile({ tenantId, sessionId, previewVersion });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(64, 1));
    writePreviewSidecar(
      { tenantId, sessionId, previewVersion },
      {
        schemaVersion: 'crop.preview-sidecar:v1',
        sessionId,
        previewId: 'pv:ph',
        previewVersion,
        configHash: 'abc',
        status: 'READY',
        outputRef: 'review-preview/session-a/preview.mp4',
        backgroundTreatment: 'UNRESOLVED',
        backgroundMode: 'SMOKE_PLACEHOLDER_SOLID_BLACK',
        width: 720,
        height: 1280,
        durationMs: 1000,
        productionUsable: false,
        previewOnly: true,
        backgroundApprovalEligible: false,
        clientRequestId: null,
        createdAt: new Date().toISOString(),
        failureCode: null,
      },
    );
    const recon = reconcilePreviewArtifact({ ...loc(), probe: () => null });
    expect(recon.placeholder).toBe(true);
    expect(recon.backgroundApprovalEligible).toBe(false);
  });
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { previewStoreFile } from './preview-media-store.js';

export type PreviewSidecarV1 = {
  schemaVersion: 'crop.preview-sidecar:v1';
  sessionId: string;
  previewId: string;
  previewVersion: string;
  configHash: string;
  status: 'READY' | 'FAILED';
  outputRef: string;
  backgroundTreatment: string;
  backgroundMode: string;
  width: 720;
  height: 1280;
  durationMs: number | null;
  productionUsable: false;
  previewOnly: true;
  backgroundApprovalEligible: boolean;
  clientRequestId: string | null;
  createdAt: string;
  failureCode: string | null;
};

export function previewSidecarPath(input: { tenantId: string; sessionId: string; previewVersion: string }): string {
  return previewStoreFile(input).replace(/\.mp4$/i, '.json');
}

export function readPreviewSidecar(input: { tenantId: string; sessionId: string; previewVersion: string }): PreviewSidecarV1 | null {
  const file = previewSidecarPath(input);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PreviewSidecarV1;
  } catch {
    return null;
  }
}

export function writePreviewSidecar(input: { tenantId: string; sessionId: string; previewVersion: string }, sidecar: PreviewSidecarV1): void {
  const file = previewSidecarPath(input);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
}

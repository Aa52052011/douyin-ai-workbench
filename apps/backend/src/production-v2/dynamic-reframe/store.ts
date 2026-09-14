import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG as C } from './render-config.js';
import type { DynamicReframePlanV1 } from './types.js';

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function dynamicPreviewRoot(): string {
  return path.join(repoRootFromHere(), '.local', 'dynamic-reframe-previews');
}

export function dynamicPreviewFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  const version = safe(input.previewVersion ?? C.previewVersion);
  return path.join(dynamicPreviewRoot(), safe(input.tenantId), safe(input.sessionId), `${version}.mp4`);
}

export function dynamicSidecarFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  return dynamicPreviewFile(input).replace(/\.mp4$/i, '.json');
}

export function dynamicPreviewConfigHash(plan: DynamicReframePlanV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        assetId: plan.assetId,
        planVersion: plan.schemaVersion,
        segments: plan.segments,
        background: C.backgroundMode,
        review: `${C.reviewWidth}x${C.reviewHeight}`,
        production: `${C.productionWidth}x${C.productionHeight}`,
        audioPolicy: C.audioPolicy,
        scaler: C.scaler,
        codec: { name: C.codec, crf: C.crf, pix: C.pixelFormat },
        productionUsable: false,
        previewUpscaleAllowed: false,
      }),
    )
    .digest('hex');
}

export type DynamicPreviewSidecarV1 = {
  schemaVersion: 'dynamic.preview-sidecar:v1';
  previewVersion: string;
  previewId: string;
  configHash: string;
  assetId: string;
  sessionId: string;
  dynamicPlanVersion: string;
  segmentCount: number;
  runtimeShotCount: number;
  background: string;
  reviewResolution: string;
  productionTargetResolution: string;
  productionSourcePolicy: string;
  productionDirectFromOriginal: true;
  previewUpscaleForProduction: false;
  productionUsable: false;
  audioPolicy: string;
  scaler: string;
  crf: number;
  createdAt: string;
  status: 'READY' | 'FAILED' | 'RENDERING';
  failureCode: string | null;
  durationMs: number | null;
  shotSplitApplied: boolean;
};

export function readDynamicSidecar(input: { tenantId: string; sessionId: string; previewVersion?: string }): DynamicPreviewSidecarV1 | null {
  const file = dynamicSidecarFile(input);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as DynamicPreviewSidecarV1;
  } catch {
    return null;
  }
}

export function writeDynamicSidecar(
  input: { tenantId: string; sessionId: string; previewVersion?: string },
  sidecar: DynamicPreviewSidecarV1,
): void {
  const file = dynamicSidecarFile(input);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
}

export function openDynamicPreviewStream(input: { tenantId: string; sessionId: string; previewVersion?: string }): ReadStream | null {
  const file = dynamicPreviewFile(input);
  if (!existsSync(file)) return null;
  return createReadStream(file);
}

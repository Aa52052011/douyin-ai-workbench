import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import type { SourceAwareEditorialPlanV2 } from '../source-aware-editorial/director.js';
import type { RuntimeTimelineSegmentV1 } from '../source-aware-editorial/timeline.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as C } from './render-config.js';

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function sourceAwarePreviewRoot(): string {
  return path.join(repoRootFromHere(), '.local', 'source-aware-previews');
}

export function sourceAwarePreviewFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  const version = safe(input.previewVersion ?? C.previewVersion);
  return path.join(sourceAwarePreviewRoot(), safe(input.tenantId), safe(input.sessionId), `${version}.mp4`);
}

export function sourceAwareSidecarFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  return sourceAwarePreviewFile(input).replace(/\.mp4$/i, '.json');
}

export function sourceAwarePreviewConfigHash(
  plan: SourceAwareEditorialPlanV2,
  segments: readonly RuntimeTimelineSegmentV1[],
  source?: { size: number; mtimeMs: number },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        assetId: plan.assetId,
        sourceVersion: source ?? null,
        planVersion: plan.schemaVersion,
        decisions: plan.decisions,
        segments,
        integrity: 'semantic.composition-integrity:v1',
        smartUiFit: 'smart-ui-fit:v1',
        background: plan.backgroundComposition,
        review: `${C.reviewWidth}x${C.reviewHeight}`,
        production: `${C.productionWidth}x${C.productionHeight}`,
        codec: { name: C.codec, crf: C.crf, pix: C.pixelFormat },
        scaler: C.scaler,
        audioPolicy: C.audioPolicy,
        blankGuardMs: 150,
        productionUsable: false,
        previewUpscaleAllowed: false,
      }),
    )
    .digest('hex');
}

export type SourceAwarePreviewSidecarV1 = {
  schemaVersion: 'source-aware.preview-sidecar:v1';
  previewVersion: string;
  configHash: string;
  assetId: string;
  sessionId: string;
  sourceVisualType: string;
  sourceAwarePlanVersion: string;
  decisionCount: number;
  keepCurrentCount: number;
  timelineSegmentCount: number;
  renderedShotCount: number;
  smartUiFitVersion: string;
  semanticIntegrityVersion: string;
  frameContinuityVersion: string;
  reviewResolution: string;
  productionTargetResolution: string;
  productionDirectFromOriginal: true;
  previewUpscaleAllowed: false;
  productionUsable: false;
  audioPolicy: string;
  createdAt: string;
  status: 'READY' | 'FAILED' | 'RENDERING';
  failureCode: string | null;
  durationMs: number | null;
};

export function readSourceAwareSidecar(input: { tenantId: string; sessionId: string; previewVersion?: string }): SourceAwarePreviewSidecarV1 | null {
  const file = sourceAwareSidecarFile(input);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SourceAwarePreviewSidecarV1;
  } catch {
    return null;
  }
}

export function writeSourceAwareSidecar(
  input: { tenantId: string; sessionId: string; previewVersion?: string },
  sidecar: SourceAwarePreviewSidecarV1,
): void {
  const file = sourceAwareSidecarFile(input);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
}

export function openSourceAwarePreviewStream(input: { tenantId: string; sessionId: string; previewVersion?: string }): ReadStream | null {
  const file = sourceAwarePreviewFile(input);
  if (!existsSync(file)) return null;
  return createReadStream(file);
}

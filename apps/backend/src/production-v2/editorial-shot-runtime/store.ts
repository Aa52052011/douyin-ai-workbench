import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import type { EditorialShotPlanV1 } from '../editorial-shot-director/types.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG as C } from './render-config.js';

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function editorialPreviewRoot(): string {
  return path.join(repoRootFromHere(), '.local', 'editorial-shot-previews');
}

export function editorialPreviewFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  const version = safe(input.previewVersion ?? C.previewVersion);
  return path.join(editorialPreviewRoot(), safe(input.tenantId), safe(input.sessionId), `${version}.mp4`);
}

export function editorialSidecarFile(input: { tenantId: string; sessionId: string; previewVersion?: string }): string {
  return editorialPreviewFile(input).replace(/\.mp4$/i, '.json');
}

export function editorialPreviewConfigHash(
  plan: EditorialShotPlanV1,
  source?: { size: number; mtimeMs: number },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        assetId: plan.assetId,
        sourceVersion: source ?? null,
        planVersion: plan.schemaVersion,
        shots: plan.shots,
        shotScales: plan.shots.map((item) => ({ id: item.shotId, scale: item.shotScale, crop: item.normalizedCrop })),
        background: plan.backgroundComposition,
        backgroundPerShot: plan.shots.map((item) => ({ id: item.shotId, bg: item.backgroundTreatment })),
        transitions: plan.shots.map((item) => ({ id: item.shotId, in: item.transitionIn, out: item.transitionOut })),
        review: `${C.reviewWidth}x${C.reviewHeight}`,
        production: `${C.productionWidth}x${C.productionHeight}`,
        audioPolicy: C.audioPolicy,
        scaler: C.scaler,
        codec: { name: C.codec, crf: C.crf, pix: C.pixelFormat },
        overlay: { medium: C.mediumOverlay, easedMs: C.easedMotionMs, easedZ: C.easedZoomEnd, motion: 'PLAN_SHORT_EASED_ZOOM_RENDERED_AS_CUT' },
        productionUsable: false,
        previewUpscaleAllowed: false,
      }),
    )
    .digest('hex');
}

export type EditorialPreviewSidecarV1 = {
  schemaVersion: 'editorial.preview-sidecar:v1';
  previewVersion: string;
  previewId: string;
  configHash: string;
  assetId: string;
  sessionId: string;
  editorialPlanVersion: string;
  shotCount: number;
  wideCount: number;
  mediumCount: number;
  detailCount: number;
  reviewResolution: string;
  productionTargetResolution: string;
  productionSourcePolicy: string;
  productionDirectFromOriginal: true;
  previewUpscaleForProduction: false;
  previewUpscaleAllowed: false;
  productionUsable: false;
  backgroundPolicyVersion: string;
  transitionPolicy: string;
  audioPolicy: string;
  scaler: string;
  crf: number;
  createdAt: string;
  status: 'READY' | 'FAILED' | 'RENDERING';
  failureCode: string | null;
  durationMs: number | null;
};

export function readEditorialSidecar(input: { tenantId: string; sessionId: string; previewVersion?: string }): EditorialPreviewSidecarV1 | null {
  const file = editorialSidecarFile(input);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as EditorialPreviewSidecarV1;
  } catch {
    return null;
  }
}

export function writeEditorialSidecar(
  input: { tenantId: string; sessionId: string; previewVersion?: string },
  sidecar: EditorialPreviewSidecarV1,
): void {
  const file = editorialSidecarFile(input);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
}

export function openEditorialPreviewStream(input: { tenantId: string; sessionId: string; previewVersion?: string }): ReadStream | null {
  const file = editorialPreviewFile(input);
  if (!existsSync(file)) return null;
  return createReadStream(file);
}

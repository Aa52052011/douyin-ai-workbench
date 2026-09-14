import { existsSync, statSync } from 'node:fs';
import { FROZEN_TOP_TRIM_CROP, REVIEW_PREVIEW_SIZE } from './preview-config.js';
import { previewStoreFile, resolvePreviewAbsolutePath } from './preview-media-store.js';
import { readPreviewSidecar, type PreviewSidecarV1 } from './preview-sidecar.js';

export type PreviewProbe = {
  ok: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
};

export type ArtifactReconciliation = {
  status: 'READY' | 'STALE' | 'MISSING_ARTIFACT' | 'FAILED';
  failureCode: string | null;
  fileExists: boolean;
  size: number;
  playable: boolean;
  placeholder: boolean;
  backgroundApprovalEligible: boolean;
  configHash: string | null;
  sidecar: PreviewSidecarV1 | null;
  absolutePath: string | null;
};

export function reconcilePreviewArtifact(input: {
  tenantId: string;
  sessionId: string;
  previewVersion: string;
  assetId: string;
  previewId: string | null;
  dbLooksReady: boolean;
  probe?: (filePath: string) => PreviewProbe | null;
}): ArtifactReconciliation {
  const absolutePath = resolvePreviewAbsolutePath(input);
  const sidecar = readPreviewSidecar(input);
  if (!input.previewId && !input.dbLooksReady) {
    return {
      status: 'STALE',
      failureCode: 'PREVIEW_NOT_RENDERED',
      fileExists: false,
      size: 0,
      playable: false,
      placeholder: false,
      backgroundApprovalEligible: false,
      configHash: sidecar?.configHash ?? null,
      sidecar,
      absolutePath,
    };
  }
  if (!absolutePath || !existsSync(absolutePath)) {
    return {
      status: 'MISSING_ARTIFACT',
      failureCode: 'PREVIEW_ARTIFACT_MISSING',
      fileExists: false,
      size: 0,
      playable: false,
      placeholder: false,
      backgroundApprovalEligible: false,
      configHash: sidecar?.configHash ?? null,
      sidecar,
      absolutePath: null,
    };
  }
  const size = statSync(absolutePath).size;
  if (size <= 0) {
    return {
      status: 'MISSING_ARTIFACT',
      failureCode: 'PREVIEW_ARTIFACT_MISSING',
      fileExists: true,
      size,
      playable: false,
      placeholder: false,
      backgroundApprovalEligible: false,
      configHash: sidecar?.configHash ?? null,
      sidecar,
      absolutePath,
    };
  }
  if (size < 32) {
    return {
      status: 'FAILED',
      failureCode: 'OUTPUT_INVALID',
      fileExists: true,
      size,
      playable: false,
      placeholder: sidecar?.backgroundMode === 'SMOKE_PLACEHOLDER_SOLID_BLACK',
      backgroundApprovalEligible: false,
      configHash: sidecar?.configHash ?? null,
      sidecar,
      absolutePath,
    };
  }
  if (input.probe) {
    const probed = input.probe(absolutePath);
    if (probed) {
      if (!probed.ok || !probed.hasVideo) {
        return {
          status: 'FAILED',
          failureCode: 'FFPROBE_FAILED',
          fileExists: true,
          size,
          playable: false,
          placeholder: false,
          backgroundApprovalEligible: false,
          configHash: sidecar?.configHash ?? null,
          sidecar,
          absolutePath,
        };
      }
      if (probed.width !== REVIEW_PREVIEW_SIZE.width || probed.height !== REVIEW_PREVIEW_SIZE.height) {
        return {
          status: 'FAILED',
          failureCode: 'OUTPUT_INVALID',
          fileExists: true,
          size,
          playable: false,
          placeholder: false,
          backgroundApprovalEligible: false,
          configHash: sidecar?.configHash ?? null,
          sidecar,
          absolutePath,
        };
      }
      if (probed.hasAudio) {
        return {
          status: 'FAILED',
          failureCode: 'OUTPUT_INVALID',
          fileExists: true,
          size,
          playable: false,
          placeholder: false,
          backgroundApprovalEligible: false,
          configHash: sidecar?.configHash ?? null,
          sidecar,
          absolutePath,
        };
      }
    }
  }
  const placeholder = sidecar?.backgroundMode === 'SMOKE_PLACEHOLDER_SOLID_BLACK' || sidecar?.backgroundTreatment === 'UNRESOLVED';
  return {
    status: 'READY',
    failureCode: null,
    fileExists: true,
    size,
    playable: true,
    placeholder,
    backgroundApprovalEligible: sidecar?.backgroundApprovalEligible === true && !placeholder,
    configHash: sidecar?.configHash ?? null,
    sidecar,
    absolutePath,
  };
}

export function expectedOutputPath(input: { tenantId: string; sessionId: string; previewVersion: string }): string {
  return previewStoreFile(input);
}

export { FROZEN_TOP_TRIM_CROP };

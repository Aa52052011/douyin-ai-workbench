import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { resolveStorageRoot } from '../../media/storage/local-storage.provider.js';
import { parseVideoOnlyFfprobe, PREVIEW_DURATION_TOLERANCE_MS, durationWithinTolerance } from '../crop-review-flow/preview-runtime-plan.js';
import type { PersistedReviewSession } from './persistence.types.js';
import { bumpPreviewVersion } from './review-http-view.js';
import {
  backgroundConfigForSession,
  isPreviewOfPreviewPath,
  PLACEHOLDER_CONFIG,
  previewConfigHash,
  type PreviewBackgroundConfig,
} from './preview-config.js';
import { abstractPreviewRef, previewStoreFile } from './preview-media-store.js';
import { blurSourceFilterGraph, placeholderOrSolidFilterGraph } from './preview-filter-graphs.js';
import { reconcilePreviewArtifact, type PreviewProbe } from './preview-artifact-reconciliation.js';
import { writePreviewSidecar } from './preview-sidecar.js';
import { PgCropReviewRepository } from './pg-repository.js';

const PREVIEW_TIMEOUT_MS = 120_000;

export type PreviewRenderRequest = {
  clientRequestId?: string;
  solidColor?: string;
  staticImageAssetId?: string;
};

@Injectable()
export class CropReviewPreviewRuntimeService {
  private readonly inFlight = new Set<string>();

  constructor(private readonly repo: PgCropReviewRepository) {}

  isBusy(sessionId: string): boolean {
    return this.inFlight.has(sessionId);
  }

  async reconcileAndPersist(session: PersistedReviewSession): Promise<{
    session: PersistedReviewSession;
    recon: ReturnType<typeof reconcilePreviewArtifact>;
  }> {
    const recon = reconcilePreviewArtifact({
      tenantId: session.tenantId,
      sessionId: session.id,
      previewVersion: session.previewVersion,
      assetId: session.assetId,
      previewId: session.previewId,
      dbLooksReady: Boolean(session.previewId) && (session.status === 'READY_FOR_REVIEW' || session.status === 'APPROVED'),
      probe: probeIfPossible,
    });
    if (recon.failureCode === 'PREVIEW_ARTIFACT_MISSING' && session.status === 'READY_FOR_REVIEW') {
      const next = await this.repo.updateSessionFields(session.id, session.tenantId, {
        status: 'PREVIEW_PENDING',
        invalidationReason: 'PREVIEW_ARTIFACT_MISSING',
      });
      return { session: next ?? session, recon: { ...recon, status: 'STALE' } };
    }
    if (recon.status === 'FAILED' && session.status === 'READY_FOR_REVIEW') {
      const next = await this.repo.updateSessionFields(session.id, session.tenantId, {
        status: 'PREVIEW_PENDING',
        invalidationReason: recon.failureCode,
      });
      return { session: next ?? session, recon };
    }
    return { session, recon };
  }

  async render(session: PersistedReviewSession, request: PreviewRenderRequest = {}): Promise<{
    ok: boolean;
    code?: string;
    ffmpegSpawned: boolean;
    session: PersistedReviewSession;
    sidecar?: unknown;
  }> {
    if (this.inFlight.has(session.id)) {
      return { ok: true, ffmpegSpawned: false, session };
    }
    this.inFlight.add(session.id);
    try {
      return await this.renderExclusive(session, request);
    } finally {
      this.inFlight.delete(session.id);
    }
  }

  private async renderExclusive(session: PersistedReviewSession, request: PreviewRenderRequest = {}): Promise<{
    ok: boolean;
    code?: string;
    ffmpegSpawned: boolean;
    session: PersistedReviewSession;
    sidecar?: unknown;
  }> {
    const cfg = backgroundConfigForSession(session.backgroundTreatment, {
      solidColor: request.solidColor,
      staticImageAssetId: request.staticImageAssetId,
    });
    if ('error' in cfg) return { ok: false, code: cfg.error, ffmpegSpawned: false, session };
    if (cfg.type === 'STATIC_IMAGE' || cfg.type === 'DUPLICATE_BLUR' || cfg.type === 'AI_GENERATED') {
      return { ok: false, code: 'BACKGROUND_UNSUPPORTED', ffmpegSpawned: false, session };
    }
    const hash = previewConfigHash({
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      background: cfg,
    });
    const existing = reconcilePreviewArtifact({
      tenantId: session.tenantId,
      sessionId: session.id,
      previewVersion: session.previewVersion,
      assetId: session.assetId,
      previewId: session.previewId,
      dbLooksReady: Boolean(session.previewId),
      probe: probeIfPossible,
    });
    if (existing.status === 'READY' && existing.configHash === hash) {
      return { ok: true, ffmpegSpawned: false, session };
    }
    const previewVersion = bumpPreviewVersion(session.previewVersion);
    const outputPath = previewStoreFile({ tenantId: session.tenantId, sessionId: session.id, previewVersion });
    mkdirSync(path.dirname(outputPath), { recursive: true });
    const storageKey = await this.repo.getAssetStorageKey(session.assetId, session.tenantId);
    if (!storageKey) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, session };
    const inputPath = path.resolve(resolveStorageRoot(), storageKey.replaceAll('/', path.sep));
    if (!existsSync(inputPath)) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, session };
    if (isPreviewOfPreviewPath(inputPath)) return { ok: false, code: 'PREVIEW_OF_PREVIEW_REJECTED', ffmpegSpawned: false, session };
    if (path.resolve(inputPath) === path.resolve(outputPath)) return { ok: false, code: 'SOURCE_OVERWRITE', ffmpegSpawned: false, session };

    await this.repo.updateSessionFields(session.id, session.tenantId, {
      status: 'PREVIEW_PENDING',
      previewVersion,
      invalidationReason: 'PREVIEW_RENDERING',
    });

    const filterGraph = filterFor(cfg);
    const tempPath = `${outputPath}.tmp.mp4`;
    const complex = filterGraph.includes('[');
    try {
      const sourceProbe = await probeFile(inputPath);
      if (!sourceProbe?.ok || !sourceProbe.hasVideo) {
        await failSession(this.repo, session, previewVersion, 'PREVIEW_SOURCE_MISSING');
        return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, session };
      }
      if (existsSync(tempPath)) unlinkSync(tempPath);
      const before = statSync(inputPath);
      await runChildProcess(ffmpegBin(), mutedArgs(inputPath, tempPath, filterGraph, complex), { timeoutMs: PREVIEW_TIMEOUT_MS });
      const after = statSync(inputPath);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        await failSession(this.repo, session, previewVersion, 'SOURCE_MUTATED');
        return { ok: false, code: 'SOURCE_MUTATED', ffmpegSpawned: true, session };
      }
      const probed = await probeFile(tempPath);
      if (!probed?.ok) {
        await failSession(this.repo, session, previewVersion, 'FFPROBE_FAILED');
        return { ok: false, code: 'FFPROBE_FAILED', ffmpegSpawned: true, session };
      }
      if (probed.width !== 720 || probed.height !== 1280 || probed.hasAudio) {
        await failSession(this.repo, session, previewVersion, 'OUTPUT_INVALID');
        return { ok: false, code: 'OUTPUT_INVALID', ffmpegSpawned: true, session };
      }
      if (
        sourceProbe.durationMs != null &&
        probed.durationMs != null &&
        !durationWithinTolerance(sourceProbe.durationMs, probed.durationMs, PREVIEW_DURATION_TOLERANCE_MS)
      ) {
        await failSession(this.repo, session, previewVersion, 'OUTPUT_INVALID');
        return { ok: false, code: 'OUTPUT_INVALID', ffmpegSpawned: true, session };
      }
      renameSync(tempPath, outputPath);
      const previewId = `pv:${cfg.type.toLowerCase()}:${hash.slice(0, 12)}`;
      const sidecar = {
        schemaVersion: 'crop.preview-sidecar:v1' as const,
        sessionId: session.id,
        previewId,
        previewVersion,
        configHash: hash,
        status: 'READY' as const,
        outputRef: abstractPreviewRef(session.id, previewVersion),
        backgroundTreatment: session.backgroundTreatment,
        backgroundMode: cfg.type === 'REVIEW_PLACEHOLDER' ? PLACEHOLDER_CONFIG.mode : cfg.type,
        width: 720 as const,
        height: 1280 as const,
        durationMs: probed.durationMs ?? null,
        productionUsable: false as const,
        previewOnly: true as const,
        backgroundApprovalEligible: cfg.type !== 'REVIEW_PLACEHOLDER',
        clientRequestId: request.clientRequestId ?? null,
        createdAt: new Date().toISOString(),
        failureCode: null,
      };
      writePreviewSidecar({ tenantId: session.tenantId, sessionId: session.id, previewVersion }, sidecar);
      const next = await this.repo.updateSessionFields(session.id, session.tenantId, {
        status: 'READY_FOR_REVIEW',
        previewId,
        previewVersion,
        invalidationReason: cfg.type === 'REVIEW_PLACEHOLDER' ? 'PREVIEW_PLACEHOLDER_RECOVERY' : null,
      });
      return { ok: true, ffmpegSpawned: true, session: next ?? session, sidecar };
    } catch (error) {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
      }
      await failSession(this.repo, session, previewVersion, 'FFMPEG_FAILED');
      const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown';
      return { ok: false, code: 'FFMPEG_FAILED', ffmpegSpawned: true, session, sidecar: { failureDetail: message } };
    }
  }
}

function filterFor(cfg: PreviewBackgroundConfig): string {
  if (cfg.type === 'BLUR_SOURCE') return blurSourceFilterGraph();
  return placeholderOrSolidFilterGraph('black');
}

function mutedArgs(inputPath: string, outputPath: string, filterGraph: string, complex: boolean): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath];
  if (complex) args.push('-filter_complex', filterGraph);
  else args.push('-vf', filterGraph);
  args.push('-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath);
  return args;
}

export function probeIfPossible(filePath: string): PreviewProbe | null {
  if (process.env.NODE_ENV === 'test' && process.env.RUN_FFMPEG_TESTS !== 'true') return null;
  try {
    const result = spawnSync(ffprobeBin(), buildFfprobeArgs(filePath), {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: 15_000,
    });
    if (result.status !== 0) return { ok: false };
    const parsed = parseVideoOnlyFfprobe(result.stdout);
    if (!parsed) return { ok: false };
    return {
      ok: true,
      width: parsed.width,
      height: parsed.height,
      durationMs: parsed.durationMs,
      hasAudio: parsed.hasAudio,
      hasVideo: parsed.hasVideo,
    };
  } catch {
    return null;
  }
}

async function probeFile(filePath: string): Promise<PreviewProbe | null> {
  try {
    const result = await runChildProcess(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 20_000 });
    const parsed = parseVideoOnlyFfprobe(result.stdout);
    if (!parsed) return { ok: false };
    return {
      ok: true,
      width: parsed.width,
      height: parsed.height,
      durationMs: parsed.durationMs,
      hasAudio: parsed.hasAudio,
      hasVideo: parsed.hasVideo,
    };
  } catch {
    return { ok: false };
  }
}

async function failSession(repo: PgCropReviewRepository, session: PersistedReviewSession, previewVersion: string, code: string) {
  await repo.updateSessionFields(session.id, session.tenantId, {
    status: 'PREVIEW_PENDING',
    previewVersion,
    invalidationReason: code,
  });
}

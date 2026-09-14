import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveStorageRoot } from '../../media/storage/local-storage.provider.js';
import { PgCropReviewRepository } from '../crop-approval-persistence/pg-repository.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { renderSourceAwarePreview } from './runtime.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from './render-config.js';
import { readSourceAwareSidecar } from './store.js';

@Injectable()
export class SourceAwarePreviewRuntimeService {
  private readonly inFlight = new Set<string>();

  constructor(private readonly repo: PgCropReviewRepository) {}

  state(tenantId: string, sessionId: string) {
    return readSourceAwareSidecar({ tenantId, sessionId, previewVersion: SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewVersion });
  }

  isInFlight(sessionId: string): boolean {
    return this.inFlight.has(sessionId);
  }

  async requestRender(input: { tenantId: string; sessionId: string; assetId: string }): Promise<{
    ok: boolean;
    code?: string;
    ffmpegSpawned: boolean;
    previewStatus: 'READY' | 'REQUESTED' | 'FAILED';
  }> {
    if (input.assetId !== CONTENT_01_NEW_ASSET_ID) return { ok: false, code: 'ASSET_NOT_ALLOWED', ffmpegSpawned: false, previewStatus: 'FAILED' };
    const existing = this.state(input.tenantId, input.sessionId);
    if (existing?.status === 'READY') return { ok: true, ffmpegSpawned: false, previewStatus: 'READY' };
    if (this.inFlight.has(input.sessionId)) return { ok: true, ffmpegSpawned: false, previewStatus: 'REQUESTED' };
    const storageKey = await this.repo.getAssetStorageKey(input.assetId, input.tenantId);
    if (!storageKey) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewStatus: 'FAILED' };
    const sourcePath = path.resolve(resolveStorageRoot(), storageKey.replaceAll('/', path.sep));
    if (!existsSync(sourcePath) || isPreviewOfPreviewPath(sourcePath)) {
      return { ok: false, code: isPreviewOfPreviewPath(sourcePath) ? 'PREVIEW_OF_PREVIEW_REJECTED' : 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewStatus: 'FAILED' };
    }
    this.inFlight.add(input.sessionId);
    const work = renderSourceAwarePreview({
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      assetId: input.assetId,
      sourcePath,
    })
      .catch(() => undefined)
      .finally(() => this.inFlight.delete(input.sessionId));
    if (process.env.NODE_ENV === 'test') {
      const rendered = await work;
      if (!rendered?.ok) return { ok: false, code: rendered?.code ?? 'FFMPEG_FAILED', ffmpegSpawned: false, previewStatus: 'FAILED' };
      return { ok: true, ffmpegSpawned: rendered.ffmpegSpawned, previewStatus: 'READY' };
    }
    void work;
    return { ok: true, ffmpegSpawned: false, previewStatus: 'REQUESTED' };
  }
}

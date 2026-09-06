import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { MOCK_SUBTITLE_FAIL_SENTINEL } from '../media.constants.js';
import { renderSrt, type SubtitleCue } from '../../videos/pipeline/srt.js';
import { StorageService } from '../storage/storage.service.js';
import type { SubtitleProvider } from './media-provider.types.js';

@Injectable()
export class MockSubtitleProvider implements SubtitleProvider {
  readonly id = 'mock-subtitle';

  constructor(private readonly storage: StorageService) {}

  async render(request: { cues: SubtitleCue[]; storageKey: string; clientRequestId?: string }) {
    if (request.cues.some((cue) => cue.text.includes(MOCK_SUBTITLE_FAIL_SENTINEL))) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const body = renderSrt(request.cues);
    const stored = await this.storage.put(request.storageKey, Buffer.from(body, 'utf8'), {
      mimeType: 'text/plain',
    });
    return {
      storageKey: stored.key,
      mimeType: 'text/plain',
      size: stored.size,
      body,
    };
  }
}

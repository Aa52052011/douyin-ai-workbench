import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { MOCK_VIDEO_FAIL_SENTINEL } from '../media.constants.js';
import { StorageService } from '../storage/storage.service.js';
import type { VideoProvider, VideoProviderRequest, VideoProviderResult } from './video.provider.js';

@Injectable()
export class MockVideoProvider implements VideoProvider {
  readonly id = 'mock-video';

  constructor(private readonly storage: StorageService) {}

  async render(request: VideoProviderRequest): Promise<VideoProviderResult> {
    if (request.requirements === MOCK_VIDEO_FAIL_SENTINEL) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const body = Buffer.from(`mock-video\n${request.scriptId}\n${request.requestId}\n`);
    const stored = await this.storage.put(request.storageKey, body, { mimeType: 'video/mp4' });
    return {
      storageKey: stored.key,
      size: stored.size,
      mimeType: 'video/mp4',
      duration: request.targetDuration ?? 15,
      width: 1080,
      height: 1920,
      originalFilename: 'mock-output.mp4',
    };
  }
}

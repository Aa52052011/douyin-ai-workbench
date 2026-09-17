import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { MOCK_COMPOSE_FAIL_SENTINEL, MOCK_VIDEO_FAIL_SENTINEL } from '../media.constants.js';
import { parseResolution } from '../ffmpeg/ffmpeg-config.js';
import { StorageService } from '../storage/storage.service.js';
import type { ComposeProvider } from './media-provider.types.js';

@Injectable()
export class MockComposeProvider implements ComposeProvider {
  readonly id = 'mock-compose';
  readonly capabilities = { compose: true, async: false as const };

  constructor(private readonly storage: StorageService) {}

  async compose(request: {
    storageKey: string;
    voiceDuration: number;
    targetDuration: number;
    sceneCount: number;
    clientRequestId?: string;
    failToken?: string;
    resolution?: string;
  }) {
    if (request.failToken === MOCK_COMPOSE_FAIL_SENTINEL || request.failToken === MOCK_VIDEO_FAIL_SENTINEL) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const body = Buffer.from(
      `mock-compose\n${request.clientRequestId ?? ''}\nscenes=${request.sceneCount}\nvoice=${request.voiceDuration}\n`,
      'utf8',
    );
    const { width, height } = parseResolution(request.resolution);
    const stored = await this.storage.put(request.storageKey, body, { mimeType: 'video/mp4' });
    return {
      storageKey: stored.key,
      duration: request.voiceDuration,
      width,
      height,
      mimeType: 'video/mp4',
      size: stored.size,
    };
  }
}

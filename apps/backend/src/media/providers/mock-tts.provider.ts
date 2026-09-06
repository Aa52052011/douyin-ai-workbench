import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { buildSilentWav } from '../audio/silent-wav.js';
import { MOCK_VOICE_FAIL_SENTINEL } from '../media.constants.js';
import { StorageService } from '../storage/storage.service.js';
import type { TtsProvider } from './media-provider.types.js';

export function mockVoiceDuration(text: string, speed = 1): number {
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.ceil(chars / (8 * Math.max(speed, 0.25))));
}

@Injectable()
export class MockTtsProvider implements TtsProvider {
  readonly id = 'mock-tts';

  constructor(private readonly storage: StorageService) {}

  async synthesize(request: {
    text: string;
    storageKey: string;
    voice?: string;
    language?: string;
    speed?: number;
    clientRequestId?: string;
  }) {
    if (request.text.includes(MOCK_VOICE_FAIL_SENTINEL)) {
      throw new AppError(ErrorCode.VIDEO_PROVIDER_FAILED);
    }
    const duration = mockVoiceDuration(request.text, request.speed ?? 1);
    const body = buildSilentWav(duration);
    const stored = await this.storage.put(request.storageKey, body, { mimeType: 'audio/wav' });
    return {
      storageKey: stored.key,
      duration,
      mimeType: 'audio/wav',
      size: stored.size,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { buildAudiblePlaceholderWav } from '../audio/audible-placeholder-wav.js';
import { parseWavHeader } from '../audio/silent-wav.js';
import { wavIsAudible } from '../audio/wav-pcm.js';
import { synthesizeWithWindowsSapi } from '../audio/windows-sapi-tts.js';
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
  readonly capabilities = { tts: true as const, async: false as const };

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
    const estimated = mockVoiceDuration(request.text, request.speed ?? 1);
    const rendered = await renderLocalMockVoice(request.text, request.speed ?? 1, estimated);
    const stored = await this.storage.put(request.storageKey, rendered.body, { mimeType: 'audio/wav' });
    return {
      storageKey: stored.key,
      duration: rendered.duration,
      mimeType: 'audio/wav',
      size: stored.size,
      usage: {
        inputCharacters: request.text.replace(/\s+/g, '').length,
        audioSeconds: rendered.duration,
        audioSecondsExact: rendered.duration,
        provider: this.id,
        model: rendered.engine,
        estimatedCost: 0,
        currency: 'CNY',
      },
    };
  }
}

async function renderLocalMockVoice(
  text: string,
  speed: number,
  estimatedDuration: number,
): Promise<{ body: Buffer; duration: number; engine: 'windows-sapi' | 'audible-placeholder' }> {
  const forcePlaceholder =
    process.env.ACF_MOCK_TTS_ENGINE === 'placeholder' ||
    (process.env.NODE_ENV === 'test' && process.env.ACF_MOCK_TTS_ENGINE !== 'sapi');
  if (!forcePlaceholder) {
    const sapi = await synthesizeWithWindowsSapi(text, speed);
    if (sapi && wavIsAudible(sapi)) {
      const header = parseWavHeader(sapi);
      return {
        body: sapi,
        duration: Math.max(1, Math.round(header.duration) || estimatedDuration),
        engine: 'windows-sapi',
      };
    }
  }
  const body = buildAudiblePlaceholderWav(estimatedDuration, text);
  return { body, duration: estimatedDuration, engine: 'audible-placeholder' };
}

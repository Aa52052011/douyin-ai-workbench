import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { isFfmpegAvailable } from '../ffmpeg/ffmpeg-available.js';
import { MIN_PNG } from '../media.constants.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { FfmpegComposeProvider, sceneTempFilename } from './ffmpeg-compose.provider.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

describe.skipIf(isFfmpegAvailable())('FfmpegComposeProvider without binary', () => {
  it('fails with a sanitized unavailable error', async () => {
    const provider = new FfmpegComposeProvider(new StorageService(new LocalStorageProvider()));
    await expect(
      provider.compose({
        storageKey: 'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555',
        voiceDuration: 2,
        targetDuration: 15,
        sceneCount: 1,
        scenes: [{ storageKey: 'missing', durationBudget: 2 }],
        voiceStorageKey: 'missing',
        subtitleStorageKey: 'missing',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VIDEO_PROVIDER_FAILED });
  });
});

describe('FfmpegComposeProvider image temp names', () => {
  it('picks png and jpeg from magic bytes, not storageKey', () => {
    expect(sceneTempFilename(0, MIN_PNG, 'image/jpeg')).toBe('scene-001.png');
    expect(sceneTempFilename(1, MIN_JPEG, 'image/png')).toBe('scene-002.jpg');
    expect(sceneTempFilename(2, Buffer.from('nope'), 'image/jpeg')).toBe('scene-003.jpg');
  });
});

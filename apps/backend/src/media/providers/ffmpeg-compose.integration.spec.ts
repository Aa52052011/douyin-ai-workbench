import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSilentWav } from '../audio/silent-wav.js';
import { ffprobeBin } from '../ffmpeg/ffmpeg-config.js';
import { isFfmpegAvailable } from '../ffmpeg/ffmpeg-available.js';
import { buildFfprobeArgs, parseFfprobeJson } from '../ffmpeg/ffprobe.js';
import { runChildProcess } from '../ffmpeg/run-process.js';
import { MIN_PNG } from '../media.constants.js';
import { LocalStorageProvider } from '../storage/local-storage.provider.js';
import { StorageService } from '../storage/storage.service.js';
import { FfmpegComposeProvider } from './ffmpeg-compose.provider.js';

const enabled = process.env.RUN_FFMPEG_TESTS === 'true' && isFfmpegAvailable();

describe.skipIf(!enabled)('FfmpegComposeProvider integration', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-ff-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previous;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('renders a playable mp4 with video and audio streams', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const prefix =
      'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
    const sceneA = `${prefix}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    const sceneB = `${prefix}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
    const voice = `${prefix}/cccccccc-cccc-4ccc-8ccc-cccccccccccc/cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
    const sub = `${prefix}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
    const out = `${prefix}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`;
    await storage.put(sceneA, MIN_PNG, { mimeType: 'image/png' });
    await storage.put(sceneB, MIN_PNG, { mimeType: 'image/png' });
    await storage.put(voice, buildSilentWav(2), { mimeType: 'audio/wav' });
    await storage.put(
      sub,
      Buffer.from('1\n00:00:00,000 --> 00:00:02,000\n你好世界\n', 'utf8'),
      { mimeType: 'text/plain' },
    );
    const provider = new FfmpegComposeProvider(storage);
    const result = await provider.compose({
      storageKey: out,
      voiceDuration: 2,
      targetDuration: 15,
      sceneCount: 2,
      resolution: '1080x1920',
      fps: 30,
      scenes: [
        { storageKey: sceneA, durationBudget: 1 },
        { storageKey: sceneB, durationBudget: 1 },
      ],
      voiceStorageKey: voice,
      subtitleStorageKey: sub,
    });
    expect(result.mimeType).toBe('video/mp4');
    expect(result.duration).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
    expect(await storage.exists(out)).toBe(true);

    const mp4Path = path.join(root, 'probe.mp4');
    await writeFile(mp4Path, await storage.get(out));
    const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(mp4Path), {
      timeoutMs: 15_000,
    });
    const summary = parseFfprobeJson(probed.stdout);
    expect(summary).not.toBeNull();
    expect(summary?.hasVideo).toBe(true);
    expect(summary?.hasAudio).toBe(true);
    expect(summary?.duration).toBeGreaterThan(0);
    expect(summary?.videoCodec).toBe('h264');
    expect(summary?.audioCodec).toBe('aac');
    expect(summary?.width).toBe(1080);
    expect(summary?.height).toBe(1920);
    expect(summary?.fps).toBe(30);
    expect(result.size).toBeGreaterThan(0);
    console.log(
      'FFMPEG_INTEGRATION_PROBE',
      JSON.stringify({
        size: result.size,
        duration: summary?.duration,
        videoCodec: summary?.videoCodec,
        audioCodec: summary?.audioCodec,
        width: summary?.width,
        height: summary?.height,
        fps: summary?.fps,
      }),
    );
  }, 60_000);
});

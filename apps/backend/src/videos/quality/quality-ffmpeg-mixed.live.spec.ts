import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSilentWav } from '../../media/audio/silent-wav.js';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { isFfmpegAvailable } from '../../media/ffmpeg/ffmpeg-available.js';
import { buildFfprobeArgs, parseFfprobeJson } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { MIN_PNG } from '../../media/media.constants.js';
import { LocalStorageProvider } from '../../media/storage/local-storage.provider.js';
import { StorageService } from '../../media/storage/storage.service.js';
import { FfmpegComposeProvider } from '../../media/providers/ffmpeg-compose.provider.js';
import { runDeterministicQualityChecks } from './quality-check.js';

const enabled = isFfmpegAvailable();

describe('mixed ffmpeg live quality acceptance', () => {
  it('requires local ffmpeg and ffprobe', () => {
    expect(enabled).toBe(true);
  });

  describe.skipIf(!enabled)('encode', () => {
    let root: string;
    let previous: string | undefined;

    beforeEach(() => {
      previous = process.env.MEDIA_STORAGE_ROOT;
      root = mkdtempSync(path.join(os.tmpdir(), 'acf-mix-'));
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

    it(
      'image + video + voice + subtitle → mp4 → ffprobe PASS',
      async () => {
      const storage = new StorageService(new LocalStorageProvider());
      const prefix =
        'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
      const imageKey = `${prefix}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      const videoKey = `${prefix}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
      const voiceKey = `${prefix}/cccccccc-cccc-4ccc-8ccc-cccccccccccc/cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
      const subKey = `${prefix}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
      const outKey = `${prefix}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`;
      await storage.put(imageKey, MIN_PNG, { mimeType: 'image/png' });
      const clipPath = path.join(root, 'clip.mp4');
      await runChildProcess(
        ffmpegBin(),
        ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-pix_fmt', 'yuv420p', clipPath],
        { timeoutMs: 20_000 },
      );
      const { readFile } = await import('node:fs/promises');
      await storage.put(videoKey, await readFile(clipPath), { mimeType: 'video/mp4' });
      await storage.put(voiceKey, buildSilentWav(2), { mimeType: 'audio/wav' });
      await storage.put(subKey, Buffer.from('1\n00:00:00,000 --> 00:00:02,000\n你好世界\n', 'utf8'), { mimeType: 'text/plain' });
      const provider = new FfmpegComposeProvider(storage);
      const result = await provider.compose({
        storageKey: outKey,
        voiceDuration: 2,
        targetDuration: 15,
        sceneCount: 2,
        resolution: '1080x1920',
        fps: 30,
        scenes: [
          { storageKey: imageKey, durationBudget: 1, kind: 'image' },
          { storageKey: videoKey, durationBudget: 1, kind: 'video', freezePadSec: 0.2 },
        ],
        voiceStorageKey: voiceKey,
        subtitleStorageKey: subKey,
      });
      const mp4Path = path.join(root, 'out.mp4');
      await writeFile(mp4Path, await storage.get(outKey));
      const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(mp4Path), { timeoutMs: 15_000 });
      const summary = parseFfprobeJson(probed.stdout);
      expect(summary).not.toBeNull();
      expect(summary?.width).toBe(1080);
      expect(summary?.height).toBe(1920);
      expect(summary?.videoCodec).toMatch(/h264|avc1/);
      expect(summary?.audioCodec).toMatch(/aac/);
      expect(summary?.fps ?? 30).toBeGreaterThan(20);
      expect(summary?.duration).toBeGreaterThan(1);
      const quality = runDeterministicQualityChecks({
        qualityInputHash: 'live',
        attempt: 0,
        composeProvider: 'ffmpeg-compose',
        fileExists: true,
        storageExists: true,
        probe: summary,
        probeFailed: !summary,
        expectedWidth: 1080,
        expectedHeight: 1920,
        expectedFps: 30,
        targetDurationSec: 2,
        voiceDurationSec: 2,
        timelineDurationMs: Math.round((summary?.duration ?? 2) * 1000),
        voiceExpected: true,
        hasCtaInPlan: false,
        timeline: {
          durationMs: Math.round((summary?.duration ?? 2) * 1000),
          tracks: {
            visual: [
              { sequence: 1, startMs: 0, endMs: Math.round(((summary?.duration ?? 2) * 1000) / 2), assetId: 'img', assetType: 'IMAGE' },
              { sequence: 2, startMs: Math.round(((summary?.duration ?? 2) * 1000) / 2), endMs: Math.round((summary?.duration ?? 2) * 1000), assetId: 'vid', assetType: 'VIDEO' },
            ],
            voice: [{ assetId: 'voice' }],
            subtitle: [{ assetId: 'sub' }],
          },
        },
        assets: [
          { id: 'img', tenantId: 't', type: 'IMAGE', status: 'READY', referenceOnly: false, exists: true },
          { id: 'vid', tenantId: 't', type: 'VIDEO', status: 'READY', referenceOnly: false, exists: true },
          { id: 'voice', tenantId: 't', type: 'AUDIO', status: 'READY', referenceOnly: false, exists: true },
        ],
        subtitleCues: [{ start: 0, end: Math.min(2, summary?.duration ?? 2), text: '你好世界' }],
        canvasWidth: 1080,
      });
      expect(quality.status).toBe('PASS');
      writeFileSync(path.join(root, 'ffprobe.json'), JSON.stringify({ exitCode: 0, summary, result }, null, 2));
    },
    60_000,
  );
  });
});

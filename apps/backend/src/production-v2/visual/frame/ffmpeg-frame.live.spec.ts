import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { isFfmpegAvailable } from '../../../media/ffmpeg/ffmpeg-available.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';
import { MIN_PNG } from '../../../media/media.constants.js';
import { buildMediaMetadata } from '../deterministic-metadata-analyzer.js';
import { FrameSamplerService } from './frame-sampler.service.js';
import { sampleAndStatFrames } from './sample-and-stat.js';

const enabled = isFfmpegAvailable();

async function encodeColorMp4(file: string, color: string, seconds: number, withAudio: boolean) {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=160x90:d=${seconds}`,
  ];
  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest', '-c:a', 'aac');
  } else {
    args.push('-an');
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', file);
  await runChildProcess(ffmpegBin(), args, { timeoutMs: 20_000 });
}

describe('ffmpeg analysis frame sampling live', () => {
  it('requires ffmpeg', () => {
    expect(enabled).toBe(true);
  });

  describe.skipIf(!enabled)('extract', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(path.join(os.tmpdir(), 'acf-dva-live-'));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('samples silent black video and audio white video', async () => {
      const silent = path.join(root, 'silent.mp4');
      const voiced = path.join(root, 'voiced.mp4');
      const png = path.join(root, 'still.png');
      writeFileSync(png, MIN_PNG);
      await encodeColorMp4(silent, 'black', 2, false);
      await encodeColorMp4(voiced, 'white', 2, true);
      const silentMeta = buildMediaMetadata({
        width: 160,
        height: 90,
        durationMs: 2000,
        hasAudio: false,
        mimeType: 'video/mp4',
      })!;
      const whiteMeta = buildMediaMetadata({
        width: 160,
        height: 90,
        durationMs: 2000,
        hasAudio: true,
        mimeType: 'video/mp4',
      })!;
      const imgMeta = buildMediaMetadata({
        width: 1,
        height: 1,
        hasAudio: false,
        mimeType: 'image/png',
      })!;
      const started = Date.now();
      const silentResult = await sampleAndStatFrames({ metadata: silentMeta, filePath: silent });
      const whiteResult = await sampleAndStatFrames({ metadata: whiteMeta, filePath: voiced });
      const imageResult = await sampleAndStatFrames({ metadata: imgMeta, filePath: png });
      const elapsed = Date.now() - started;
      expect(silentResult.ok && !silentResult.skipped).toBe(true);
      expect(whiteResult.ok && !whiteResult.skipped).toBe(true);
      expect(imageResult.ok && !imageResult.skipped).toBe(true);
      if (silentResult.ok && !silentResult.skipped && whiteResult.ok && !whiteResult.skipped) {
        expect(silentResult.attach.frameStatsAggregate.sampleCountExtracted).toBeGreaterThan(0);
        expect(silentResult.attach.frameStatsAggregate.luma.median).toBeLessThan(
          whiteResult.attach.frameStatsAggregate.luma.median,
        );
      }
      expect(elapsed).toBeLessThan(30_000);
      expect(new FrameSamplerService()).toBeTruthy();
    });
  });
});

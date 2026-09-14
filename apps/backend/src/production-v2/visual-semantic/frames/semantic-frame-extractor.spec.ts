import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { isFfmpegAvailable } from '../../../media/ffmpeg/ffmpeg-available.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';
import { parseVisualSemanticAnalysisRequest } from '../schema/visual-semantic-request.schema.js';
import { SemanticFrameExtractor, buildProviderRequestDraft, withSemanticFrames } from './semantic-frame-extractor.js';
import { SEMANTIC_FRAME_ERROR } from './semantic-frame-errors.js';

const SEMANTIC_RETRY = 100;
const enabled = isFfmpegAvailable();
const probeJson = JSON.stringify({
  streams: [{ codec_type: 'video', width: 160, height: 90, codec_name: 'h264' }],
  format: { duration: '2.0' },
});

async function encodeColor(file: string, size: string, seconds: number, color: string, audio: boolean) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:d=${seconds}`];
  if (audio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest', '-c:a', 'aac');
  } else {
    args.push('-an');
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', file);
  await runChildProcess(ffmpegBin(), args, { timeoutMs: 20_000 });
}

function mockExtractor(opts: { failTs?: number; alwaysFail?: boolean; timeout?: boolean }) {
  const run = async (bin: string, args: string[]) => {
    if (String(bin).includes('ffprobe') || args.includes('-show_streams')) {
      return { stdout: probeJson, stderr: '' };
    }
    const outPath = args[args.length - 1] as string;
    if (opts.timeout) {
      throw new Error('Video compose timed out');
    }
    if (opts.alwaysFail) {
      throw new Error('decode');
    }
    const ss = args[args.indexOf('-ss') + 1];
    const ts = Math.round(Number(ss) * 1000);
    if (opts.failTs !== undefined && ts <= opts.failTs + SEMANTIC_RETRY) {
      throw new Error('decode');
    }
    await writeFile(outPath, Buffer.alloc(64, 7));
    return { stdout: '', stderr: '' };
  };
  const extractor = new SemanticFrameExtractor(run);
  extractor.lumaThumb = async () => ({ width: 2, height: 2, pixels: Buffer.from([10, 10, 10, 10]) });
  return extractor;
}

describe('semantic frame extraction (mocked)', () => {
  it('PARTIAL when one frame fails and keeps others provider-ready', async () => {
    const extractor = mockExtractor({ failTs: 0 });
    await withSemanticFrames(
      { assetId: 'v', mediaKind: 'VIDEO', mediaPath: 'in.mp4', durationMs: 2000, sourceWidth: 160, sourceHeight: 90 },
      async (prep) => {
        expect(prep.status).toBe('PARTIAL');
        expect(prep.errors).toContain(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_PARTIAL);
        expect(prep.providerReadyFrames.length).toBeGreaterThan(0);
        expect(prep.extractedFrames.some((f) => f.extractionStatus === 'FAILED')).toBe(true);
      },
      { extractor },
    );
  });

  it('FAILED when all extracts fail', async () => {
    const extractor = mockExtractor({ alwaysFail: true });
    await withSemanticFrames(
      { assetId: 'v', mediaKind: 'VIDEO', mediaPath: 'in.mp4', durationMs: 2000, sourceWidth: 160, sourceHeight: 90 },
      async (prep) => {
        expect(prep.status).toBe('FAILED');
        expect(prep.providerReadyFrames).toHaveLength(0);
        expect(prep.errors).toContain(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_EXTRACTION_FAILED);
      },
      { extractor },
    );
  });

  it('maps timeout without leaking internals', async () => {
    const extractor = mockExtractor({ timeout: true });
    await withSemanticFrames(
      { assetId: 'v', mediaKind: 'VIDEO', mediaPath: 'in.mp4', durationMs: 2000 },
      async (prep) => {
        expect(prep.errors).toContain(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_TIMEOUT);
        expect(JSON.stringify(prep)).not.toMatch(/D:\\|C:\\Users\\|apiKey|stack/i);
      },
      { extractor },
    );
  });

  it('cleans temp even when callback throws', async () => {
    const extractor = mockExtractor({});
    let leaked: string | undefined;
    await expect(
      withSemanticFrames(
        { assetId: 'v', mediaKind: 'VIDEO', mediaPath: 'in.mp4', durationMs: 800 },
        async (prep, scope) => {
          leaked = scope.resolve(prep.providerReadyFrames[0]!.frameId);
          expect(existsSync(leaked)).toBe(true);
          throw new Error('boom');
        },
        { extractor },
      ),
    ).rejects.toThrow('boom');
    expect(leaked && existsSync(leaked)).toBe(false);
  });

  it('builds provider request compatible with B2-1 schema without calling provider', async () => {
    const extractor = mockExtractor({});
    await withSemanticFrames(
      { assetId: 'asset-synthetic', mediaKind: 'VIDEO', mediaPath: 'in.mp4', durationMs: 2000 },
      async (prep) => {
        const draft = buildProviderRequestDraft({
          requestId: 'req-video',
          assetId: 'asset-synthetic',
          mediaKind: 'VIDEO',
          frames: prep.providerReadyFrames,
          durationMs: 2000,
        });
        const parsed = parseVisualSemanticAnalysisRequest(draft);
        expect(parsed.frames.length).toBeGreaterThan(0);
        expect(parsed.frames[0]?.mediaRef.kind).toBe('LOCAL_REF');
        expect(JSON.stringify(prep)).not.toMatch(/browser|UI_FOCUS|stale|DO_NOT_USE|bestCrop/i);
      },
      { extractor },
    );
  });
});

describe.skipIf(!enabled)('semantic frame extraction live', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-semantic-live-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('extracts silent/voiced landscape jpeg without upscale or stretch', async () => {
    const silent = path.join(root, 'silent.mp4');
    const voiced = path.join(root, 'voiced.mp4');
    await encodeColor(silent, '320x180', 1.2, 'black', false);
    await encodeColor(voiced, '320x180', 1.2, 'white', true);
    await withSemanticFrames({ assetId: 's', mediaKind: 'VIDEO', mediaPath: silent, durationMs: 1200 }, async (prep, scope) => {
      expect(prep.providerReadyFrames.length).toBeGreaterThan(0);
      const frame = prep.providerReadyFrames[0]!;
      expect(frame.format).toBe('jpeg');
      expect(frame.width).toBe(320);
      expect(frame.height).toBe(180);
      expect(existsSync(scope.resolve(frame.frameId))).toBe(true);
      expect(JSON.stringify(prep)).not.toMatch(/^[A-Za-z]:\\/m);
    });
    await withSemanticFrames({ assetId: 'a', mediaKind: 'VIDEO', mediaPath: voiced, durationMs: 1200 }, async (prep) => {
      expect(prep.status).not.toBe('FAILED');
    });
  });

  it('preserves portrait orientation', async () => {
    const file = path.join(root, 'port.mp4');
    await encodeColor(file, '90x160', 1, 'blue', false);
    await withSemanticFrames({ assetId: 'p', mediaKind: 'VIDEO', mediaPath: file, durationMs: 1000 }, async (prep) => {
      const frame = prep.providerReadyFrames[0]!;
      expect(frame.width).toBe(90);
      expect(frame.height).toBe(160);
    });
  });
});

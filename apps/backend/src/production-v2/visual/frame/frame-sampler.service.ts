import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';
import { FRAME_ANALYSIS_CONFIG, analysisSize } from './frame-analysis-config.js';
import type { LumaFrame } from './luma-stats.js';

export type ExtractRunner = (bin: string, args: string[], opts: { timeoutMs: number }) => Promise<{ stdout: string }>;

/**
 * ANALYSIS_FRAME_SAMPLE only. Seek is approximate (often nearest keyframe).
 * Do not reuse for freeze-frame editing or interpolation.
 */
export class FrameSamplerService {
  constructor(private readonly run: ExtractRunner = runChildProcess) {}

  async withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'acf-dva-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async extractLumaFrame(input: {
    filePath: string;
    timestampMs: number;
    sourceWidth: number;
    sourceHeight: number;
    workDir: string;
    sampleId: string;
  }): Promise<LumaFrame> {
    const size = analysisSize(input.sourceWidth, input.sourceHeight);
    const outName = `${input.sampleId}.gray`;
    const outPath = path.join(input.workDir, outName);
    const seconds = Math.max(0, input.timestampMs) / 1000;
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-an',
      '-ss',
      seconds.toFixed(3),
      '-i',
      input.filePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${size.width}:${size.height}:flags=fast_bilinear,format=gray`,
      '-f',
      'rawvideo',
      outPath,
    ];
    await this.run(ffmpegBin(), args, { timeoutMs: FRAME_ANALYSIS_CONFIG.extractTimeoutMs });
    const pixels = await readFile(outPath);
    if (pixels.byteLength !== size.width * size.height) {
      throw new Error('FRAME_DECODE_FAILED');
    }
    await rm(outPath, { force: true });
    return { width: size.width, height: size.height, pixels };
  }

  /** Copy bytes to a temp input so ffmpeg never needs a user-path in logs we persist. */
  async writeInputCopy(workDir: string, body: Buffer, ext: string): Promise<string> {
    const file = path.join(workDir, `src${ext.startsWith('.') ? ext : `.${ext}`}`);
    await writeFile(file, body);
    return file;
  }
}

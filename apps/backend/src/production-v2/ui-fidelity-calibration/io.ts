import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import type { CalibrationTargetV1 } from './compose.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as BASE } from '../source-aware-preview/render-config.js';

export function runFfmpeg(args: string[], timeoutMs = 600_000) {
  return spawnSync(ffmpegBin(), args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 20_000_000 });
}

export function probeJson(filePath: string) {
  const raw = spawnSync(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  });
  return JSON.parse(raw.stdout || '{}') as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      avg_frame_rate?: string;
      bit_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string; bit_rate?: string; size?: string; format_name?: string };
  };
}

export function summarizeProbe(filePath: string) {
  const json = probeJson(filePath);
  const video = json.streams?.find((item) => item.codec_type === 'video');
  const audio = json.streams?.find((item) => item.codec_type === 'audio');
  const fpsParts = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = fpsParts[1] ? fpsParts[0] / fpsParts[1] : fpsParts[0];
  return {
    container: json.format?.format_name ?? '',
    codec: video?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    pix_fmt: video?.pix_fmt ?? null,
    fps,
    durationSec: Number(video?.duration ?? json.format?.duration ?? NaN),
    bitRate: Number(video?.bit_rate ?? json.format?.bit_rate ?? NaN),
    hasAudio: Boolean(audio),
    bytes: existsSync(filePath) ? statSync(filePath).size : 0,
  };
}

export function extractPng(input: string, tSec: number, output: string, vf?: string) {
  mkdirSync(path.dirname(output), { recursive: true });
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(tSec), '-i', input, '-frames:v', '1'];
  if (vf) args.push('-vf', vf);
  args.push(output);
  const result = runFfmpeg(args, 30_000);
  return result.status === 0 && existsSync(output) && statSync(output).size > 0;
}

export function decodeCheck(filePath: string) {
  return runFfmpeg(['-hide_banner', '-v', 'error', '-i', filePath, '-f', 'null', '-'], 180_000).status === 0;
}

export function parseSsimPsnr(stderr: string) {
  const ssim = Number(/All:([0-9.]+)/.exec(stderr)?.[1] ?? NaN);
  const psnr = Number(/average:([0-9.]+)/.exec(stderr)?.[1] ?? NaN);
  return { ssim: Number.isFinite(ssim) ? ssim : null, psnr: Number.isFinite(psnr) ? psnr : null };
}

export function comparePng(refPath: string, encPath: string) {
  const result = runFfmpeg(
    ['-hide_banner', '-i', refPath, '-i', encPath, '-lavfi', '[0][1]ssim;[0][1]psnr', '-f', 'null', '-'],
    30_000,
  );
  return parseSsimPsnr(`${result.stderr ?? ''}\n${result.stdout ?? ''}`);
}

export function edgeEnergy(pngPath: string): number | null {
  const dir = path.join(os.tmpdir(), `b215g-edge-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const result = spawnSync(
    ffmpegBin(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      pngPath,
      '-frames:v',
      '1',
      '-vf',
      'format=gray,edgedetect=low=0.1:high=0.35,signalstats,metadata=print:file=edge.txt',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 20_000, cwd: dir },
  );
  let text = `${result.stderr ?? ''}`;
  try {
    text += `\n${readFileSync(path.join(dir, 'edge.txt'), 'utf8')}`;
  } catch {
    text += '';
  }
  const yavg = Number(/lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(text)?.[1] ?? NaN);
  return Number.isFinite(yavg) ? yavg : null;
}

export function glyphHeightFromGray(raw: Buffer, width: number, height: number): number {
  const rowVar: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let sum2 = 0;
    for (let x = 0; x < width; x += 1) {
      const v = raw[y * width + x];
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / width;
    rowVar.push(sum2 / width - mean * mean);
  }
  const meanVar = rowVar.reduce((a, b) => a + b, 0) / Math.max(1, rowVar.length);
  const thresh = meanVar * 0.45;
  const runs: number[] = [];
  let run = 0;
  for (const value of rowVar) {
    if (value > thresh) run += 1;
    else {
      if (run >= 6 && run <= height * 0.6) runs.push(run);
      run = 0;
    }
  }
  if (run >= 6 && run <= height * 0.6) runs.push(run);
  runs.sort((a, b) => a - b);
  if (!runs.length) return Math.round(height * 0.4);
  return runs[Math.floor(runs.length / 2)];
}

export function measureSourceGlyph(
  sourcePath: string,
  tSec: number,
  rect: { x: number; y: number; width: number; height: number },
): number | null {
  const dir = path.join(os.tmpdir(), `b215g-glyph-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const rawPath = path.join(dir, 'glyph.raw');
  const result = runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(tSec),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},format=gray`,
      '-f',
      'rawvideo',
      rawPath,
    ],
    20_000,
  );
  if (result.status !== 0 || !existsSync(rawPath)) return null;
  const raw = readFileSync(rawPath);
  if (raw.length < rect.width * rect.height) return null;
  return glyphHeightFromGray(raw.subarray(0, rect.width * rect.height), rect.width, rect.height);
}

export function stillFilter(
  crop: { x: number; y: number; width: number; height: number },
  target: CalibrationTargetV1,
): string {
  return [
    `split=2[fg][bg]`,
    `[fg]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${target.width}:${target.height}:flags=${target.scalerFlags}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgc]`,
    `[bg]scale=${target.width}:${target.height}:flags=${target.scalerFlags}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${target.width}:${target.height},boxblur=${BASE.blurLuma}:${BASE.blurChroma},eq=brightness=${BASE.wideBgBrightness}[bgb]`,
    `[bgb][fgc]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`,
  ].join(';');
}

export function writeJson(root: string, rel: string, value: unknown) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

export function mean(values: Array<number | null | undefined>): number | null {
  const vals = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

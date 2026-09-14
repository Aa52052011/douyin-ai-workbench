import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin } from '../../media/ffmpeg/ffmpeg-config.js';
import type { FrameSignalV1 } from '../editorial-shot-runtime/continuity.js';

export const SOURCE_AWARE_BLANK_PROBE_MS = [6000, 6331, 7000, 8000, 9000, 9131, 9500] as const;

function parseSignalMeta(text: string): { yavg: number; ydif: number; ylow: number; yhigh: number; ymin: number; ymax: number; satmax: number } | null {
  const pick = (key: string): number => Number(new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`).exec(text)?.[1] ?? NaN);
  const yavg = pick('YAVG');
  if (!Number.isFinite(yavg)) return null;
  return {
    yavg,
    ydif: pick('YDIF'),
    ylow: pick('YLOW'),
    yhigh: pick('YHIGH'),
    ymin: pick('YMIN'),
    ymax: pick('YMAX'),
    satmax: pick('SATMAX'),
  };
}

export function sampleSignalstatsFrame(filePath: string, tMs: number): FrameSignalV1 | null {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sa-sig-'));
  const metaName = 'signal.txt';
  try {
    const probed = spawnSync(
      ffmpegBin(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        (tMs / 1000).toFixed(3),
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        `signalstats,metadata=print:file=${metaName}`,
        '-f',
        'null',
        '-',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000, cwd: dir },
    );
    const metaPath = path.join(dir, metaName);
    let text = `${probed.stderr ?? ''}\n${probed.stdout ?? ''}`;
    try {
      text = `${text}\n${readFileSync(metaPath, 'utf8')}`;
    } catch {
      writeFileSync(path.join(dir, 'empty'), '');
    }
    const parsed = parseSignalMeta(text);
    if (!parsed) return null;
    const range = Number.isFinite(parsed.yhigh) && Number.isFinite(parsed.ylow) ? (parsed.yhigh - parsed.ylow) / 255 : 0;
    const span = Number.isFinite(parsed.ymax) && Number.isFinite(parsed.ymin) ? (parsed.ymax - parsed.ymin) / 255 : 0;
    const sat = Number.isFinite(parsed.satmax) ? parsed.satmax / 64 : 0;
    const ydif = Number.isFinite(parsed.ydif) ? parsed.ydif : 0;
    return {
      tMs,
      lumaMean: parsed.yavg / 255,
      lumaVariance: Math.min(1, Math.max(ydif / 40, range, span * 0.5)),
      edgeEnergy: Math.min(1, Math.max(ydif / 30, sat, span)),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function sampleBlankWindowFrames(filePath: string, timesMs: readonly number[] = SOURCE_AWARE_BLANK_PROBE_MS): {
  frames: FrameSignalV1[];
  diagnosticProbeCalls: number;
} {
  const frames: FrameSignalV1[] = [];
  let diagnosticProbeCalls = 0;
  for (const tMs of timesMs) {
    diagnosticProbeCalls += 1;
    const frame = sampleSignalstatsFrame(filePath, tMs);
    if (frame) frames.push(frame);
  }
  return { frames, diagnosticProbeCalls };
}

import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';

export const SYNTHETIC_FIXTURE_WIDTH = 1280;
export const SYNTHETIC_FIXTURE_HEIGHT = 720;

type Rgb = [number, number, number];

function fillRect(buf: Buffer, x: number, y: number, w: number, h: number, color: Rgb): void {
  const W = SYNTHETIC_FIXTURE_WIDTH;
  const H = SYNTHETIC_FIXTURE_HEIGHT;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.floor(x + w));
  const y1 = Math.min(H, Math.floor(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 3;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
    }
  }
}

/** 5x7 uppercase bitmap for a tiny ASCII overlay (no external font). */
const GLYPHS: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  ',': [0, 0, 0, 0, 0x04, 0x04, 0x08],
};

function drawText(buf: Buffer, text: string, x: number, y: number, color: Rgb, scale = 3): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row] ?? 0;
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          fillRect(buf, cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
}

export function renderSyntheticProductUiPpm(): Buffer {
  const pixels = Buffer.alloc(SYNTHETIC_FIXTURE_WIDTH * SYNTHETIC_FIXTURE_HEIGHT * 3, 0);
  fillRect(pixels, 0, 0, 1280, 720, [245, 247, 251]);
  fillRect(pixels, 0, 0, 1280, 72, [27, 79, 140]);
  fillRect(pixels, 0, 72, 220, 648, [232, 238, 247]);
  fillRect(pixels, 240, 96, 1008, 592, [255, 255, 255]);
  fillRect(pixels, 260, 560, 180, 48, [47, 111, 237]);
  fillRect(pixels, 460, 560, 180, 48, [226, 232, 240]);
  drawText(pixels, 'AI WORKBENCH', 24, 24, [255, 255, 255], 3);
  drawText(pixels, 'CONTENT', 36, 120, [27, 79, 140], 2);
  drawText(pixels, 'SCRIPTS', 36, 170, [27, 79, 140], 2);
  drawText(pixels, 'PANEL', 280, 130, [51, 65, 85], 3);
  drawText(pixels, 'START', 292, 574, [255, 255, 255], 2);
  drawText(pixels, 'DRAFT', 498, 574, [51, 65, 85], 2);
  drawText(pixels, 'EXAMPLE TEXT, NOT INSTRUCTIONS', 280, 200, [100, 116, 139], 2);
  const header = Buffer.from(`P6\n${SYNTHETIC_FIXTURE_WIDTH} ${SYNTHETIC_FIXTURE_HEIGHT}\n255\n`);
  return Buffer.concat([header, pixels]);
}

export async function rasterizePpmToJpeg(ppm: Buffer, outJpegPath: string): Promise<{ width: number; height: number; bytes: number }> {
  const dir = path.join(os.tmpdir(), 'acf-b2-4-fixture');
  await mkdir(dir, { recursive: true });
  const ppmPath = path.join(dir, 'synthetic-product-ui.ppm');
  await writeFile(ppmPath, ppm);
  await runChildProcess(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', ppmPath, '-q:v', '2', outJpegPath], {
    timeoutMs: 20_000,
  });
  const info = await stat(outJpegPath);
  return { width: SYNTHETIC_FIXTURE_WIDTH, height: SYNTHETIC_FIXTURE_HEIGHT, bytes: info.size };
}

import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';
import type { NormalizedRect } from '../../visual/geometry/types.js';
import type { VisualSemanticObservationType } from '../contracts/observation.types.js';
import { rasterizePpmToJpeg, SYNTHETIC_FIXTURE_HEIGHT, SYNTHETIC_FIXTURE_WIDTH } from './synthetic-product-ui-fixture.js';

type Rgb = [number, number, number];

const W = SYNTHETIC_FIXTURE_WIDTH;
const H = SYNTHETIC_FIXTURE_HEIGHT;

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
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ':': [0, 0x04, 0, 0, 0x04, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x04, 0x04],
  '/': [0x01, 0x02, 0x04, 0x04, 0x08, 0x10, 0x10],
  '-': [0, 0, 0, 0x1f, 0, 0, 0],
  ',': [0, 0, 0, 0, 0x04, 0x04, 0x08],
};

function fillRect(buf: Buffer, x: number, y: number, w: number, h: number, color: Rgb): void {
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

function drawText(buf: Buffer, text: string, x: number, y: number, color: Rgb, scale: number): void {
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

export const SYNTHETIC_BENCHMARK_VERSION = 'visual.semantic.synthetic-benchmark:v1';

export const HEADER_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 0.1 };
export const SIDEBAR_RECT: NormalizedRect = { x: 0, y: 0.1, width: 0.172, height: 0.9 };
export const PANEL_RECT: NormalizedRect = { x: 0.1875, y: 0.1333, width: 0.7875, height: 0.8222 };
export const PRIMARY_BUTTON_RECT: NormalizedRect = { x: 0.2031, y: 0.7778, width: 0.1406, height: 0.0667 };
export const CARD_RECT: NormalizedRect = { x: 0.22, y: 0.28, width: 0.28, height: 0.32 };
export const TABLE_RECT: NormalizedRect = { x: 0.22, y: 0.3, width: 0.7, height: 0.38 };

export type BenchmarkTextSize = 'LARGE' | 'MEDIUM' | 'SMALL';

export type SyntheticFrameManifest = {
  frameId: string;
  title: string;
  uniqueToken: string;
  expectedTypes: VisualSemanticObservationType[];
  optionalTypes: VisualSemanticObservationType[];
  forbiddenTypes: VisualSemanticObservationType[];
  expectedText: string[];
  expectedTextSize: Record<string, BenchmarkTextSize>;
  approxRegions: Array<{ type: VisualSemanticObservationType; rect: NormalizedRect }>;
  hasProductHeader: boolean;
  hasBrowserChrome: boolean;
};

const FORBIDDEN: VisualSemanticObservationType[] = [
  'OS_CHROME',
  'APP_WINDOW_CHROME',
  'PRIVACY_SENSITIVE',
  'DEVELOPER_ARTIFACT',
];

function baseExpected(): VisualSemanticObservationType[] {
  return ['PRODUCT_UI', 'NAVIGATION', 'CONTENT_PANEL'];
}

export const SYNTHETIC_FRAME_MANIFEST: SyntheticFrameManifest[] = [
  {
    frameId: 'synthetic-frame-0',
    title: 'HOME',
    uniqueToken: 'HOMEPAGE',
    expectedTypes: [...baseExpected(), 'BUTTON_LIKE_REGION', 'CARD'],
    optionalTypes: ['TEXT_REGION'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'HOME', 'START', 'HOMEPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', HOME: 'MEDIUM', START: 'MEDIUM', HOMEPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'BUTTON_LIKE_REGION', rect: PRIMARY_BUTTON_RECT },
      { type: 'CARD', rect: CARD_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
  {
    frameId: 'synthetic-frame-1',
    title: 'PLAN',
    uniqueToken: 'PLANPAGE',
    expectedTypes: [...baseExpected(), 'CARD'],
    optionalTypes: ['TEXT_REGION', 'BUTTON_LIKE_REGION'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'PLAN', 'PLANPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', PLAN: 'MEDIUM', PLANPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'CARD', rect: CARD_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
  {
    frameId: 'synthetic-frame-2',
    title: 'SCRIPT',
    uniqueToken: 'SCRIPTPAGE',
    expectedTypes: [...baseExpected(), 'TABLE'],
    optionalTypes: ['TEXT_REGION', 'BUTTON_LIKE_REGION'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'SCRIPT', 'SCRIPTPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', SCRIPT: 'MEDIUM', SCRIPTPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'TABLE', rect: TABLE_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
  {
    frameId: 'synthetic-frame-3',
    title: 'STUDIO',
    uniqueToken: 'STUDIOPAGE',
    expectedTypes: [...baseExpected(), 'BUTTON_LIKE_REGION'],
    optionalTypes: ['TEXT_REGION', 'CARD'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'STUDIO', 'MAKE', 'STUDIOPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', STUDIO: 'MEDIUM', MAKE: 'MEDIUM', STUDIOPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'BUTTON_LIKE_REGION', rect: PRIMARY_BUTTON_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
  {
    frameId: 'synthetic-frame-4',
    title: 'PUBLISH',
    uniqueToken: 'PUBLISHPAGE',
    expectedTypes: [...baseExpected(), 'CARD'],
    optionalTypes: ['TEXT_REGION', 'BUTTON_LIKE_REGION'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'PUBLISH', 'PUBLISHPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', PUBLISH: 'MEDIUM', PUBLISHPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'CARD', rect: CARD_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
  {
    frameId: 'synthetic-frame-5',
    title: 'SETTINGS',
    uniqueToken: 'SETTINGSPAGE',
    expectedTypes: [...baseExpected(), 'TABLE'],
    optionalTypes: ['TEXT_REGION', 'BUTTON_LIKE_REGION'],
    forbiddenTypes: [...FORBIDDEN, 'BROWSER_CHROME'],
    expectedText: ['AI WORKBENCH', 'DATA', 'SETTINGSPAGE'],
    expectedTextSize: { 'AI WORKBENCH': 'LARGE', DATA: 'MEDIUM', SETTINGSPAGE: 'SMALL' },
    approxRegions: [
      { type: 'NAVIGATION', rect: HEADER_RECT },
      { type: 'NAVIGATION', rect: SIDEBAR_RECT },
      { type: 'CONTENT_PANEL', rect: PANEL_RECT },
      { type: 'TABLE', rect: TABLE_RECT },
    ],
    hasProductHeader: true,
    hasBrowserChrome: false,
  },
];

export const BROWSER_POSITIVE_MANIFEST: SyntheticFrameManifest = {
  frameId: 'synthetic-browser-positive',
  title: 'BROWSER',
  uniqueToken: 'CHROMEPOSITIVE',
  expectedTypes: ['BROWSER_CHROME', 'PRODUCT_UI'],
  optionalTypes: ['NAVIGATION', 'CONTENT_PANEL', 'TEXT_REGION'],
  forbiddenTypes: FORBIDDEN,
  expectedText: ['EXAMPLE.COM', 'CHROMEPOSITIVE'],
  expectedTextSize: { 'EXAMPLE.COM': 'SMALL', CHROMEPOSITIVE: 'SMALL' },
  approxRegions: [{ type: 'BROWSER_CHROME', rect: { x: 0, y: 0, width: 1, height: 0.12 } }],
  hasProductHeader: true,
  hasBrowserChrome: true,
};

function drawChrome(pixels: Buffer): void {
  fillRect(pixels, 0, 0, 1280, 720, [245, 247, 251]);
  fillRect(pixels, 0, 0, 1280, 72, [27, 79, 140]);
  fillRect(pixels, 0, 72, 220, 648, [232, 238, 247]);
  fillRect(pixels, 240, 96, 1008, 592, [255, 255, 255]);
  drawText(pixels, 'AI WORKBENCH', 24, 24, [255, 255, 255], 3);
  drawText(pixels, 'PLAN', 36, 110, [27, 79, 140], 2);
  drawText(pixels, 'SCRIPT', 36, 160, [27, 79, 140], 2);
  drawText(pixels, 'STUDIO', 36, 210, [27, 79, 140], 2);
  drawText(pixels, 'PUBLISH', 36, 260, [27, 79, 140], 2);
  drawText(pixels, 'DATA', 36, 310, [27, 79, 140], 2);
}

function renderFramePpm(manifest: SyntheticFrameManifest): Buffer {
  const pixels = Buffer.alloc(W * H * 3, 0);
  if (manifest.hasBrowserChrome) {
    fillRect(pixels, 0, 0, 1280, 720, [220, 220, 220]);
    fillRect(pixels, 0, 0, 1280, 28, [200, 200, 200]);
    fillRect(pixels, 8, 6, 80, 16, [240, 240, 240]);
    fillRect(pixels, 96, 6, 80, 16, [230, 230, 230]);
    fillRect(pixels, 0, 28, 1280, 36, [245, 245, 245]);
    fillRect(pixels, 80, 34, 900, 24, [255, 255, 255]);
    drawText(pixels, 'TAB HOME', 12, 8, [40, 40, 40], 1);
    drawText(pixels, 'HTTPS://EXAMPLE.COM', 90, 38, [40, 40, 40], 1);
    fillRect(pixels, 0, 72, 1280, 72, [27, 79, 140]);
    drawText(pixels, 'AI WORKBENCH', 24, 92, [255, 255, 255], 3);
    drawText(pixels, 'CHROMEPOSITIVE', 280, 200, [100, 116, 139], 2);
    const header = Buffer.from(`P6\n${W} ${H}\n255\n`);
    return Buffer.concat([header, pixels]);
  }
  drawChrome(pixels);
  drawText(pixels, manifest.title, 280, 120, [51, 65, 85], 4);
  drawText(pixels, manifest.uniqueToken, 280, 200, [100, 116, 139], 1);
  if (manifest.expectedTypes.includes('CARD')) {
    fillRect(pixels, 280, 250, 360, 230, [241, 245, 249]);
    drawText(pixels, 'CARD', 300, 270, [51, 65, 85], 3);
  }
  if (manifest.expectedTypes.includes('TABLE')) {
    fillRect(pixels, 280, 250, 900, 270, [248, 250, 252]);
    fillRect(pixels, 280, 250, 900, 36, [226, 232, 240]);
    drawText(pixels, 'TABLE', 300, 258, [51, 65, 85], 2);
  }
  if (manifest.expectedTypes.includes('BUTTON_LIKE_REGION')) {
    fillRect(pixels, 260, 560, 180, 48, [47, 111, 237]);
    const label = manifest.frameId === 'synthetic-frame-3' ? 'MAKE' : 'START';
    drawText(pixels, label, 292, 574, [255, 255, 255], 2);
  }
  const header = Buffer.from(`P6\n${W} ${H}\n255\n`);
  return Buffer.concat([header, pixels]);
}

export async function rasterizeBenchmarkFrame(
  manifest: SyntheticFrameManifest,
  outJpegPath: string,
): Promise<{ width: number; height: number; bytes: number }> {
  const ppm = renderFramePpm(manifest);
  return rasterizePpmToJpeg(ppm, outJpegPath);
}

export async function rasterizeBenchmarkSet(
  manifests: SyntheticFrameManifest[],
  dir?: string,
): Promise<Array<{ manifest: SyntheticFrameManifest; jpegPath: string; bytes: number }>> {
  const root = dir ?? path.join(os.tmpdir(), 'acf-b2-5-fixtures');
  await mkdir(root, { recursive: true });
  const out = [];
  for (const manifest of manifests) {
    const jpegPath = path.join(root, `${manifest.frameId}.jpg`);
    const meta = await rasterizeBenchmarkFrame(manifest, jpegPath);
    out.push({ manifest, jpegPath, bytes: meta.bytes });
  }
  return out;
}

export function smoke3Manifests(): SyntheticFrameManifest[] {
  return [SYNTHETIC_FRAME_MANIFEST[0]!, SYNTHETIC_FRAME_MANIFEST[2]!, SYNTHETIC_FRAME_MANIFEST[3]!];
}

export function smoke6Manifests(): SyntheticFrameManifest[] {
  return [...SYNTHETIC_FRAME_MANIFEST];
}
